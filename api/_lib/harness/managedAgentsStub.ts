// A stand-in for the Managed Agents half of `@anthropic-ai/sdk` that never calls Anthropic. It
// replays the documented session, event and file shapes (the SDK's types, and the pages
// https://platform.claude.com/docs/en/managed-agents/events-and-streaming and
// https://platform.claude.com/docs/en/managed-agents/files, read 2026-10-14), so the client, the
// bench's managed-agents arm and later the product's server can be driven end to end at zero
// tokens: the bench's `--control` and `scripts/harness-bench.test.mjs` use it, and so will H9's
// completion tests (spec AC-1, AC-9).
//
// What a session hands in is the caller's: `agent` runs when the session is created (the bench
// passes its fake agent, which scaffolds and records a real graphic), and its files become the
// session's outputs. The scenario picks how the session ends.

import type Anthropic from '@anthropic-ai/sdk';
import { MANAGED_AGENTS_BETA, type ManagedAgentsApi } from './client.js';

type Session = Anthropic.Beta.Sessions.BetaManagedAgentsSession;
type SessionCreateParams = Anthropic.Beta.Sessions.SessionCreateParams;
type SessionEvent = Anthropic.Beta.Sessions.BetaManagedAgentsSessionEvent;
type FileMetadata = Anthropic.Beta.BetaFileMetadata;

/** How the stubbed session ends: the `stop_reason` of its last `session.status_idle`. */
export type StubScenario = 'end_turn' | 'budget_reached' | 'retries_exhausted' | 'refusal';

export interface StubOutput {
  filename: string;
  bytes: Uint8Array;
  mimeType?: string;
}

export interface StubAgentResult {
  outputs: StubOutput[];
  /** The `noacg` commands the stand-in agent ran, replayed as `agent.tool_use` bash events, each
   *  with what it printed as the `agent.tool_result`. */
  commands: Array<string | { command: string; output: string }>;
}

export interface StubOptions {
  scenario?: StubScenario;
  /** The work the session does: called once per session with its create body. */
  agent?: (sessionId: string, params: SessionCreateParams) => Promise<StubAgentResult> | StubAgentResult;
  /** The session's list cost in cents once idle (default 0: a stub spends nothing). */
  costCents?: number;
  /** Reads of the session that still answer `running` after the agent finished. */
  runningReads?: number;
  /** The agent's last message, before the session goes idle (the system prompt asks for
   *  `DELIVERED` or `NOT READY: <why>`). */
  finalMessage?: string;
}

export interface StubCall {
  method: string;
  args: unknown[];
}

class StubNotFound extends Error {
  readonly status = 404;
  constructor(what: string) {
    super(`404 not_found_error: ${what}`);
  }
}

interface StubSession {
  session: Session;
  params: SessionCreateParams;
  events: SessionEvent[];
  work: Promise<void>;
  done: boolean;
  readsLeft: number;
  deleted: boolean;
}

const at = () => new Date().toISOString();
let counter = 0;
const id = (prefix: string) => `${prefix}_stub${String(++counter).padStart(6, '0')}`;

async function* iterate<T>(items: () => T[]): AsyncIterable<T> {
  for (const item of items()) yield item;
}

export function createManagedAgentsStub(opts: StubOptions = {}): ManagedAgentsApi & { calls: StubCall[]; sessions: Map<string, StubSession>; files: Map<string, { meta: FileMetadata; bytes: Uint8Array }> } {
  const scenario = opts.scenario || 'end_turn';
  const calls: StubCall[] = [];
  const sessions = new Map<string, StubSession>();
  const files = new Map<string, { meta: FileMetadata; bytes: Uint8Array }>();
  const log = (method: string, ...args: unknown[]) => calls.push({ method, args });
  const live = (sessionId: string) => {
    const s = sessions.get(sessionId);
    if (!s || s.deleted) throw new StubNotFound(`session ${sessionId}`);
    return s;
  };
  const push = (s: StubSession, event: Record<string, unknown>) => s.events.push({ id: id('sevt'), processed_at: at(), ...event } as unknown as SessionEvent);

  const finish = (s: StubSession, result: StubAgentResult) => {
    const sessionId = s.session.id;
    const first = s.params.initial_events && s.params.initial_events[0];
    if (first) push(s, { ...first, type: 'user.message' });
    push(s, { type: 'session.status_running' });
    for (const entry of result.commands) {
      const { command, output } = typeof entry === 'string' ? { command: entry, output: 'ok' } : entry;
      const start = id('sevt');
      push(s, { type: 'span.model_request_start' });
      push(s, { type: 'agent.message', content: [{ type: 'text', text: `Running ${command.split(' ').slice(0, 2).join(' ')}.` }] });
      const use = id('sevt');
      s.events.push({ id: use, type: 'agent.tool_use', name: 'bash', input: { command }, processed_at: at(), evaluated_permission: 'allow' } as unknown as SessionEvent);
      push(s, { type: 'agent.tool_result', tool_use_id: use, content: [{ type: 'text', text: output }], is_error: false });
      push(s, { type: 'span.model_request_end', model_request_start_id: start, is_error: false, model_usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } });
    }
    for (const out of result.outputs) {
      const fileId = id('file');
      const meta = { type: 'file', id: fileId, filename: out.filename, mime_type: out.mimeType || 'application/octet-stream', size_bytes: out.bytes.length, created_at: at(), downloadable: true, scope: { type: 'session', id: sessionId } } as FileMetadata;
      files.set(fileId, { meta, bytes: out.bytes });
    }
    if (opts.finalMessage) push(s, { type: 'agent.message', content: [{ type: 'text', text: opts.finalMessage }] });
    const cost = { amount: String(opts.costCents || 0), currency: 'USD' };
    if (scenario === 'budget_reached') push(s, { type: 'session.thread_status_idle', session_thread_id: id('sthr'), stop_reason: { type: 'budget_reached' } });
    push(s, { type: 'session.usage', usage: { list_cost: cost, input_tokens: 0, output_tokens: 0 }, budget: s.session.budget });
    push(s, { type: 'session.status_idle', stop_reason: { type: scenario }, stop_details: scenario === 'refusal' ? { type: 'refusal', category: null, explanation: null } : null });
    s.session = { ...s.session, usage: { ...s.session.usage, list_cost: cost } as Session['usage'] };
    s.done = true;
  };

  const status = (s: StubSession): Session['status'] => {
    if (!s.done) return 'running';
    if (s.readsLeft > 0) {
      s.readsLeft--;
      return 'running';
    }
    return 'idle';
  };

  return {
    calls,
    sessions,
    files,
    beta: {
      sessions: {
        async create(params: SessionCreateParams) {
          log('sessions.create', params);
          const sessionId = id('sesn');
          const session = {
            type: 'session',
            id: sessionId,
            status: params.initial_events && params.initial_events.length ? 'running' : 'idle',
            title: params.title || null,
            agent: params.agent,
            environment_id: params.environment_id,
            budget: params.budget || null,
            metadata: params.metadata || {},
            resources: params.resources || [],
            vault_ids: [],
            outcome_evaluations: [],
            stats: {},
            usage: { list_cost: { amount: '0', currency: 'USD' } },
            archived_at: null,
            created_at: at(),
            updated_at: at(),
          } as unknown as Session;
          const s: StubSession = { session, params, events: [], work: Promise.resolve(), done: false, readsLeft: opts.runningReads || 0, deleted: false };
          sessions.set(sessionId, s);
          s.work = Promise.resolve(opts.agent ? opts.agent(sessionId, params) : { outputs: [], commands: [] }).then((result) => finish(s, result));
          // A failing agent is the session failing: it ends with what the scenario says.
          s.work.catch(() => finish(s, { outputs: [], commands: [] }));
          return session;
        },
        async retrieve(sessionId: string) {
          log('sessions.retrieve', sessionId);
          const s = live(sessionId);
          return { ...s.session, status: status(s) };
        },
        async delete(sessionId: string) {
          log('sessions.delete', sessionId);
          const s = live(sessionId);
          if (status(s) === 'running') throw Object.assign(new Error('400 a running session cannot be deleted; interrupt it first'), { status: 400 });
          s.deleted = true;
          return { id: sessionId, type: 'session_deleted' };
        },
        events: {
          list(sessionId: string) {
            log('sessions.events.list', sessionId);
            const s = live(sessionId);
            return iterate(() => s.events);
          },
          async send(sessionId: string, params: Anthropic.Beta.Sessions.EventSendParams) {
            log('sessions.events.send', sessionId, params);
            const s = live(sessionId);
            if (params.events.some((e) => e.type === 'user.interrupt') && !s.done) {
              finish(s, { outputs: [], commands: [] });
              s.readsLeft = 0;
            }
            return { data: [] };
          },
        },
      },
      files: {
        list(params: { scope_id: string; betas: string[] }) {
          log('files.list', params);
          if (!params.betas.includes(MANAGED_AGENTS_BETA)) throw Object.assign(new Error('400 scope_id needs the managed-agents beta'), { status: 400 });
          return iterate(() => [...files.values()].filter((f) => f.meta.scope && f.meta.scope.id === params.scope_id).map((f) => f.meta));
        },
        async download(fileId: string) {
          log('files.download', fileId);
          const f = files.get(fileId);
          if (!f) throw new StubNotFound(`file ${fileId}`);
          return new Response(Buffer.from(f.bytes));
        },
        async delete(fileId: string) {
          log('files.delete', fileId);
          if (!files.delete(fileId)) throw new StubNotFound(`file ${fileId}`);
          return { id: fileId, type: 'file_deleted' };
        },
      },
    },
  };
}

/** Wait until every stubbed session's agent has run (the stub's sessions do real work). */
export async function settled(stub: { sessions: Map<string, StubSession> }): Promise<void> {
  await Promise.all([...stub.sessions.values()].map((s) => s.work.catch(() => undefined)));
}
