// A TRUSTED JSON SOURCE (docs/work-specs/playout-external-connectors/spec.md, phase E4.1; AC-1):
// the versioned contract between the headless agent that reads a provider's JSON
// (scripts/external-data-connector.mjs) and whatever receives what it read.
//
// Three things live here, all pure:
//   - the connector's configuration: non-secret, exportable, and carrying only the NAME of the
//     credential (an environment variable of the trusted agent), never the credential. An export
//     is marked unbound, so the machine that imports it must bind its own credential first;
//   - the acceptance of one read: a newer provider revision is accepted (a lower count included,
//     a correction is a newer revision), a repeat of the accepted one is "unchanged", an older or
//     conflicting one is "stale" and malformed input is "invalid", both holding the last good;
//   - the schedule after a read: the poll interval after a success, exponential backoff with
//     jitter capped at 60 s after a failure, and never sooner than the provider's Retry-After.
//
// The acquisition and the config carry `v: 1`; a reader meeting a higher `v` must hold the source
// read-only (spec, "Storage, version gate and rollback"). Phase E4.2 adds the production's side at
// the bottom: the registration a production holds, the envelope the agent sends /api/data/source
// (claim, report, release) and that route's ingress limits.
//
// ES2020 library surface, no DOM and no runtime imports, so the browser, `api/` and Node scripts
// can all load it. scripts/external-data-connector.test.mjs drives it.

export const EXTERNAL_SOURCE_VERSION = 1;

/** Connector defaults (spec, "Connector contract"). */
export const DEFAULT_POLL_MS = 5_000;
/** The shortest poll interval any configuration may ask for, whatever the provider allows. */
export const MIN_POLL_MS = 1_000;
export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
export const BACKOFF_CAP_MS = 60_000;
/** A Retry-After longer than this is read as this: a provider cannot park the source for a day. */
export const RETRY_AFTER_CAP_MS = 60 * 60_000;
/** An unchanged read is reported at most this often (spec, "Ingress limits"). */
export const UNCHANGED_RECEIPT_MS = 15_000;

/** The envelope trusted deployment settings may move the read limits within. A configuration
 *  file cannot name them at all. */
export const LIMIT_ENVELOPE = {
  timeoutMs: { min: 1_000, max: 30_000 },
  maxBytes: { min: 64 * 1024, max: 8 * 1024 * 1024 },
} as const;

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

// ── Configuration ─────────────────────────────────────────────────────────────

/**
 * Where reads go. `hosted`: a public address, under the feed reader's guard (http(s) on its own
 * port, every DNS answer public, every redirect checked). `local`: an explicitly configured
 * destination such as a replay server beside the agent; only that origin is read, and its
 * certificate is checked against `caFile`, so TLS validation stays on.
 */
export type ConnectorMode = 'hosted' | 'local';

export interface ConnectorConfig {
  v: 1;
  sourceId: string;
  productionId: string;
  endpoint: string;
  mode: ConnectorMode;
  /** The certificate authority a `local` destination is checked against (a file path). */
  caFile: string | null;
  /** Bumped by whoever edits the configuration; the receiver refuses an old one (E4.2). */
  configRevision: number;
  /** The environment variable holding the bearer credential (NOACG_SOURCE_...), or null. */
  credentialRef: string | null;
  /** True only once this machine has bound its credential; an export is false. */
  credentialBound: boolean;
  pollMs: number;
  /** The provider's documented minimum interval, when it has one. */
  providerMinPollMs: number | null;
  /** Where the provider's own revision or sequence number is in its JSON (dotted path). */
  revisionPath: string | null;
  /** Where the provider's own event time is in its JSON (dotted path). */
  eventTimePath: string | null;
  /** What the agent sends of each accepted answer (dotted paths), so a 2 MiB answer projects to
   *  the route's 256 KiB; null sends it whole. */
  sendPaths: string[] | null;
}

const CONFIG_KEYS = new Set([
  'v',
  'sourceId',
  'productionId',
  'endpoint',
  'mode',
  'caFile',
  'configRevision',
  'credentialRef',
  'credentialBound',
  'pollMs',
  'providerMinPollMs',
  'revisionPath',
  'eventTimePath',
  'sendPaths',
]);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
/** A source id is one path segment (`external.<id>.<leaf>`): a dot would let one source's paths
 *  read as another's. */
const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
/** A credential is an environment variable of its own family, so a configuration cannot name the
 *  agent's other secrets (a database key, say) and send them to its endpoint. */
const ENV_NAME = /^NOACG_SOURCE_[A-Z0-9_]{1,50}$/;
const PATH = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const optionalString = (value: unknown): value is string | null | undefined => value === undefined || value === null || typeof value === 'string';

/**
 * A configuration as the agent takes it, or why not. Unknown keys are refused, so a secret, a
 * timeout or a byte cap written into the file never takes effect quietly.
 */
export function parseConnectorConfig(raw: unknown): { ok: true; config: ConnectorConfig } | { ok: false; error: string } {
  const no = (error: string) => ({ ok: false as const, error });
  if (!isObject(raw)) return no('the configuration is not an object');
  if (typeof raw.v === 'number' && raw.v > EXTERNAL_SOURCE_VERSION) return no(`the configuration is version ${raw.v}; this agent reads version ${EXTERNAL_SOURCE_VERSION}`);
  if (raw.v !== EXTERNAL_SOURCE_VERSION) return no('the configuration has no version');
  const unknown = Object.keys(raw).filter((key) => !CONFIG_KEYS.has(key));
  if (unknown.length > 0) return no(`unknown configuration keys: ${unknown.join(', ')}`);
  if (typeof raw.sourceId !== 'string' || !SOURCE_ID.test(raw.sourceId)) return no('sourceId must be a short identifier with no dots');
  if (typeof raw.productionId !== 'string' || !ID.test(raw.productionId)) return no('productionId must be a short identifier');
  const mode = raw.mode ?? 'hosted';
  if (mode !== 'hosted' && mode !== 'local') return no('mode must be hosted or local');
  let endpoint: URL;
  try {
    endpoint = new URL(String(raw.endpoint));
  } catch {
    return no('endpoint is not an address');
  }
  // A bearer credential never travels in clear text, and the agent never reads plain http.
  if (endpoint.protocol !== 'https:') return no('endpoint must be https');
  if (endpoint.username !== '' || endpoint.password !== '') return no('endpoint cannot carry a user name or password');
  if (!optionalString(raw.caFile)) return no('caFile must be a path');
  const caFile = raw.caFile || null;
  if (mode === 'hosted' && caFile) return no('caFile is for a local destination only');
  if (mode === 'local' && !caFile) return no('a local destination needs caFile, so TLS validation stays on');
  const configRevision = raw.configRevision;
  if (typeof configRevision !== 'number' || !Number.isInteger(configRevision) || configRevision < 1) return no('configRevision must be a whole number from 1');
  if (!optionalString(raw.credentialRef)) return no('credentialRef must be an environment variable name');
  if (raw.credentialBound !== undefined && typeof raw.credentialBound !== 'boolean') return no('credentialBound must be true or false');
  const credentialRef = raw.credentialRef || null;
  if (credentialRef !== null && !ENV_NAME.test(credentialRef)) return no('credentialRef must be an environment variable named NOACG_SOURCE_...');
  const providerMinPollMs = raw.providerMinPollMs ?? null;
  if (providerMinPollMs !== null && (typeof providerMinPollMs !== 'number' || !Number.isInteger(providerMinPollMs) || providerMinPollMs < 0)) {
    return no('providerMinPollMs must be a whole number of milliseconds');
  }
  const pollMs = raw.pollMs ?? DEFAULT_POLL_MS;
  const floor = Math.max(MIN_POLL_MS, providerMinPollMs ?? 0);
  if (typeof pollMs !== 'number' || !Number.isInteger(pollMs) || pollMs < floor) return no(`pollMs must be a whole number from ${floor}`);
  for (const key of ['revisionPath', 'eventTimePath'] as const) {
    const value = raw[key];
    if (!optionalString(value) || (value && !PATH.test(value))) return no(`${key} must be a dotted path`);
  }
  const sendPaths = raw.sendPaths ?? null;
  if (sendPaths !== null && (!Array.isArray(sendPaths) || sendPaths.length === 0 || sendPaths.length > 64 || !sendPaths.every((p) => typeof p === 'string' && PATH.test(p) && !p.split('.').includes('__proto__')))) {
    return no('sendPaths must be a list of up to 64 dotted paths');
  }
  return {
    ok: true,
    config: {
      v: 1,
      sourceId: raw.sourceId,
      productionId: raw.productionId,
      endpoint: endpoint.href,
      mode,
      caFile,
      configRevision,
      credentialRef,
      // Bound only when it says so: an export with its flag deleted is still unbound.
      credentialBound: credentialRef === null ? true : raw.credentialBound === true,
      pollMs,
      providerMinPollMs,
      revisionPath: (raw.revisionPath as string | null | undefined) || null,
      eventTimePath: (raw.eventTimePath as string | null | undefined) || null,
      sendPaths: sendPaths as string[] | null,
    },
  };
}

/** A configuration as it leaves this machine: the credential's name stays, the binding does not.
 *  Only known fields are copied. */
export function exportConnectorConfig(config: ConnectorConfig): ConnectorConfig {
  const copy: Record<string, unknown> = {};
  CONFIG_KEYS.forEach((key) => (copy[key] = (config as unknown as Record<string, unknown>)[key]));
  return { ...(copy as unknown as ConnectorConfig), credentialBound: config.credentialRef === null };
}

/** Bind this machine's credential to a configuration (a new name, or the same one confirmed). */
export function bindConnectorCredential(config: ConnectorConfig, credentialRef: string): ConnectorConfig {
  if (!ENV_NAME.test(credentialRef)) throw new Error('credentialRef must be an environment variable named NOACG_SOURCE_...');
  return { ...config, credentialRef, credentialBound: true };
}

/** The read limits, from trusted deployment settings inside the envelope, else the defaults. */
export function readLimits(settings: { timeoutMs?: unknown; maxBytes?: unknown } = {}): { timeoutMs: number; maxBytes: number } {
  const within = (value: unknown, range: { min: number; max: number }, fallback: number, name: string): number => {
    if (value === undefined || value === null || value === '') return fallback;
    const n = Number(value);
    if (!Number.isInteger(n) || n < range.min || n > range.max) throw new Error(`${name} must be a whole number from ${range.min} to ${range.max}`);
    return n;
  };
  return {
    timeoutMs: within(settings.timeoutMs, LIMIT_ENVELOPE.timeoutMs, DEFAULT_TIMEOUT_MS, 'timeoutMs'),
    maxBytes: within(settings.maxBytes, LIMIT_ENVELOPE.maxBytes, DEFAULT_MAX_BYTES, 'maxBytes'),
  };
}

// ── One read, accepted or not ─────────────────────────────────────────────────

/**
 * What a read came to. `changed`: a newer revision, accepted, payload attached. `unchanged`: the
 * accepted revision again (checked-at moves, nothing else). `stale`: an older revision, or the
 * accepted revision number with other content. `invalid`: not JSON. `denied`: the provider
 * refused the credential. `refused`: the guard refused the address. `failed`: anything passing
 * (timeout, size, an error status, the network). Every status but `changed` holds the last good.
 */
export type AcquisitionStatus = 'changed' | 'unchanged' | 'stale' | 'invalid' | 'denied' | 'refused' | 'failed';

export interface ExternalAcquisition {
  v: 1;
  sourceId: string;
  configRevision: number;
  /** The fence the agent's claim received (C2's lease, E4.2); 0 until then. */
  ownerEpoch: number;
  /** This source's own count of accepted revisions: it only ever goes up. */
  acceptedRevision: number;
  checkedAt: string;
  providerEventTime?: string;
  providerSequence?: number;
  status: AcquisitionStatus;
  payload?: JsonValue;
  error?: string;
}

/** What the agent remembers between reads, and nothing more. */
export interface SourceState {
  acceptedRevision: number;
  /** The provider's revision of the accepted payload, when it has one. */
  providerSequence: number | null;
  /** The accepted payload as canonical JSON, to tell a repeat from a change. */
  acceptedText: string | null;
  /** The latest answer's text whose content is the accepted payload, to skip the canonical form. */
  acceptedRaw: string | null;
}

export const initialSourceState = (): SourceState => ({ acceptedRevision: 0, providerSequence: null, acceptedText: null, acceptedRaw: null });

/** JSON with object keys sorted, so the same content compares equal however it was ordered. */
export function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The value at a dotted path of own object keys, or undefined. */
export function atPath(value: JsonValue, path: string | null): JsonValue | undefined {
  if (!path) return undefined;
  let at: JsonValue | undefined = value;
  for (const key of path.split('.')) {
    // Own keys only: `constructor` or `__proto__` in a path never reaches a prototype.
    if (at === null || typeof at !== 'object' || Array.isArray(at) || !Object.prototype.hasOwnProperty.call(at, key)) return undefined;
    at = at[key];
  }
  return at;
}

export type ReadOutcome =
  | { kind: 'body'; text: string }
  | { kind: 'problem'; status: 'denied' | 'refused' | 'failed'; error: string };

/**
 * Accept one read against what was accepted before. Returns the acquisition to report and the
 * state to keep. Pure: the clock's reading and the fence come in.
 */
export function acceptRead(
  config: Pick<ConnectorConfig, 'sourceId' | 'configRevision' | 'revisionPath' | 'eventTimePath'> & Partial<Pick<ConnectorConfig, 'sendPaths'>>,
  state: SourceState,
  read: ReadOutcome,
  at: { checkedAt: string; ownerEpoch: number },
): { acquisition: ExternalAcquisition; state: SourceState } {
  const base = { v: 1 as const, sourceId: config.sourceId, configRevision: config.configRevision, ownerEpoch: at.ownerEpoch, checkedAt: at.checkedAt };
  const hold = (status: AcquisitionStatus, error?: string) => ({
    acquisition: { ...base, acceptedRevision: state.acceptedRevision, status, ...(error ? { error } : {}) },
    state,
  });
  if (read.kind === 'problem') return hold(read.status, read.error);
  let payload: JsonValue;
  try {
    payload = JSON.parse(read.text) as JsonValue;
  } catch {
    return hold('invalid', 'the provider answered something that is not JSON');
  }
  const sequenceValue = atPath(payload, config.revisionPath);
  let sequence: number | null = null;
  if (config.revisionPath) {
    if (typeof sequenceValue !== 'number' || !Number.isFinite(sequenceValue)) return hold('invalid', `the provider's answer has no number at ${config.revisionPath}`);
    sequence = sequenceValue;
  }
  const eventTime = atPath(payload, config.eventTimePath);
  const provider = {
    ...(typeof eventTime === 'string' ? { providerEventTime: eventTime } : {}),
    ...(sequence !== null ? { providerSequence: sequence } : {}),
  };
  const older = sequence !== null && state.providerSequence !== null && sequence < state.providerSequence;
  if (older) return hold('stale', `revision ${sequence} is older than the accepted ${state.providerSequence}`);
  const unchanged = { acquisition: { ...base, ...provider, acceptedRevision: state.acceptedRevision, status: 'unchanged' as const }, state };
  // The same bytes as the accepted answer need no canonical form: most reads of a quiet source.
  if (read.text === state.acceptedRaw) return unchanged;
  // What would be sent decides whether anything changed: a ticking field outside `sendPaths` is
  // not a new revision. The revision and the event time were read from the whole answer.
  const sent = projectPayload(payload, config.sendPaths ?? null);
  let text: string;
  try {
    text = canonicalJson(sent);
  } catch {
    // Nesting deep enough to exhaust the stack: JSON.parse took it, nothing downstream would.
    return hold('invalid', 'the provider answered JSON nested too deeply');
  }
  // Without the accepted text (a fresh claim knows the production's sequence, not its content) the
  // same revision cannot be told from a conflicting one: it is sent whole once, and the production
  // writes only what differs.
  if (sequence !== null && sequence === state.providerSequence && state.acceptedText !== null && text !== state.acceptedText) {
    return hold('stale', `revision ${sequence} came again with other content`);
  }
  if (text === state.acceptedText) {
    const providerSequence = sequence !== null && (state.providerSequence === null || sequence > state.providerSequence) ? sequence : state.providerSequence;
    return { ...unchanged, state: { ...state, acceptedRaw: read.text, providerSequence } };
  }
  const next: SourceState = { acceptedRevision: state.acceptedRevision + 1, providerSequence: sequence, acceptedText: text, acceptedRaw: read.text };
  return { acquisition: { ...base, ...provider, acceptedRevision: next.acceptedRevision, status: 'changed', payload: sent }, state: next };
}

/** The parts of an answer the agent sends (`sendPaths`), at the same paths; null keeps it whole.
 *  A path the answer lacks is left out. */
export function projectPayload(payload: JsonValue, paths: string[] | null): JsonValue {
  if (!paths) return payload;
  const out: { [key: string]: JsonValue } = {};
  for (const path of paths) {
    const value = atPath(payload, path);
    if (value === undefined) continue;
    const keys = path.split('.');
    let at = out;
    keys.slice(0, -1).forEach((key) => {
      if (!isObject(at[key])) at[key] = {};
      at = at[key] as { [key: string]: JsonValue };
    });
    at[keys[keys.length - 1]] = value;
  }
  return out;
}

// ── When to read next ─────────────────────────────────────────────────────────

/** A Retry-After header in ms from `now`, or null. */
export function retryAfterMs(header: string | undefined | null, now: number): number | null {
  if (!header) return null;
  if (/^\s*\d+\s*$/.test(header)) return Number(header) * 1000;
  const when = Date.parse(header);
  return Number.isNaN(when) ? null : Math.max(0, when - now);
}

/**
 * How long until the next read. After a success, the poll interval. After `failures` failures in
 * a row, the interval doubled per failure and capped at BACKOFF_CAP_MS, then scaled by a jitter
 * of 50-100 % (`random` is in [0, 1)); never sooner than the poll interval itself (a provider
 * whose minimum is above the cap keeps it through an outage), nor than the provider's
 * Retry-After, which counts only up to RETRY_AFTER_CAP_MS.
 */
export function nextDelayMs(pollMs: number, failures: number, retryAfter: number | null, random: number): number {
  const backoff = failures <= 0 ? pollMs : Math.min(BACKOFF_CAP_MS, pollMs * 2 ** failures) * (0.5 + 0.5 * random);
  const asked = retryAfter === null ? 0 : Math.min(RETRY_AFTER_CAP_MS, retryAfter);
  return Math.round(Math.max(backoff, asked, pollMs));
}

// ── The production's side (phase E4.2) ────────────────────────────────────────

/** `/api/data/source`'s body cap (spec, "Ingress limits"; owner, 2026-10-20, G). The database
 *  enforces the rest: one revision per 5 s, 64 KiB rows, the 15 s receipt gap and the shared budget
 *  (supabase/migrations/0101). */
export const SOURCE_BODY_BYTES = 256 * 1024;
/** How long a claim holds the lease without a report (C2's lease takes at most 60 s). */
export const SOURCE_LEASE_MS = 30_000;

/** The list adapters a registered path may name: contentFormats' own minus standings, which write
 *  two fields from one read (E5). Migration 0101 refuses any other. */
export type SourceListAdapter = 'lines' | 'schedule' | 'credits';
const LIST_ADAPTERS = new Set<string>(['lines', 'schedule', 'credits']);

/**
 * A connector source as the production registers it: the `Show.sources` entry
 * `{id, kind: 'external', label, config, paused?}`, whose `config` is this. Non-secret: the
 * endpoint it was approved for, the config revision the agent must present, and per leaf the list
 * adapter a collection goes through. A local destination is the agent's own file's business, never
 * the production's: `mode` and `caFile` here are refused.
 */
export interface ExternalRegistration {
  v: 1;
  configRevision: number;
  endpoint: string;
  lists?: Record<string, SourceListAdapter>;
  /** E5.1's recipe as stored, judged by ./sourceMapping.ts `readSourceRecipe` (the database never
   *  reads it: it changes what is written, not whether the agent may report). */
  mapping?: unknown;
}

export type RegistrationRead =
  | { ok: true; registration: ExternalRegistration }
  /** `readOnly`: a later version, kept as it is and never applied or edited. */
  | { ok: false; readOnly: boolean; error: string };

/** Read a registered entry, or say why it cannot be used. Never throws. Migration 0101's
 *  `control_source_registration_refusal` applies the same rules and is the one that refuses. */
export function readExternalRegistration(entry: unknown): RegistrationRead {
  const no = (error: string, readOnly = false): RegistrationRead => ({ ok: false, readOnly, error });
  if (!isObject(entry) || entry.kind !== 'external' || typeof entry.id !== 'string') return no('not a connector source');
  if (!SOURCE_ID.test(entry.id)) return no('a connector source id is one path segment: letters, digits, _ and -');
  const config = entry.config;
  if (!isObject(config)) return no('the source has no configuration');
  if (typeof config.v === 'number' && config.v > EXTERNAL_SOURCE_VERSION) return no(`the source is version ${config.v}; this build reads version ${EXTERNAL_SOURCE_VERSION}, so it is held read-only`, true);
  if (config.v !== EXTERNAL_SOURCE_VERSION) return no('the source has no version');
  if ('mode' in config || 'caFile' in config) return no('a local destination is set on the agent, never in the production');
  const { configRevision, endpoint, lists } = config;
  if (typeof configRevision !== 'number' || !Number.isInteger(configRevision) || configRevision < 1) return no('configRevision must be a whole number from 1');
  if (typeof endpoint !== 'string') return no('the source has no endpoint');
  if (lists !== undefined && (!isObject(lists) || Object.entries(lists).some(([leaf, adapter]) => !PATH.test(leaf) || typeof adapter !== 'string' || !LIST_ADAPTERS.has(adapter)))) {
    return no('lists must name lines, schedule or credits for a dotted path');
  }
  return {
    ok: true,
    registration: {
      v: 1,
      configRevision,
      endpoint,
      ...(lists ? { lists: lists as ExternalRegistration['lists'] } : {}),
      ...(config.mapping !== undefined ? { mapping: config.mapping } : {}),
    },
  };
}

/** What the agent sends `/api/data/source`: a claim, a report of one read, or a release. */
export type SourceEnvelope =
  | { v: 1; op: 'claim'; sourceId: string; configRevision: number; claim: string | null }
  | { v: 1; op: 'release'; sourceId: string; configRevision: number; claim: string }
  | { v: 1; op: 'report'; sourceId: string; claim: string; acquisition: ExternalAcquisition };

const STATUSES = new Set<AcquisitionStatus>(['changed', 'unchanged', 'stale', 'invalid', 'denied', 'refused', 'failed']);
const CLAIM = /^agent:[A-Za-z0-9_-]{1,32}$/;

/** Parse an envelope, or say why not. A later `v` is refused as unsupported, never guessed at. */
export function parseSourceEnvelope(body: unknown): { ok: true; envelope: SourceEnvelope } | { ok: false; error: string; unsupported?: true } {
  const no = (error: string) => ({ ok: false as const, error });
  if (!isObject(body)) return no('the body must be a JSON object');
  if (typeof body.v === 'number' && body.v > EXTERNAL_SOURCE_VERSION) return { ok: false, error: `envelope version ${body.v} is not supported; this server reads version ${EXTERNAL_SOURCE_VERSION}`, unsupported: true };
  if (body.v !== EXTERNAL_SOURCE_VERSION) return no('the envelope has no version');
  if (typeof body.sourceId !== 'string' || !SOURCE_ID.test(body.sourceId)) return no('sourceId must be a short identifier with no dots');
  const claim = body.claim ?? null;
  if (claim !== null && (typeof claim !== 'string' || !CLAIM.test(claim))) return no('claim is not one this server handed out');
  const revision = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0;
  if (body.op === 'claim' || body.op === 'release') {
    if (!revision(body.configRevision) || (body.configRevision as number) < 1) return no('configRevision must be a whole number from 1');
    if (body.op === 'release' && claim === null) return no('a release needs its claim');
    return { ok: true, envelope: { v: 1, op: body.op, sourceId: body.sourceId, configRevision: body.configRevision as number, claim } as SourceEnvelope };
  }
  if (body.op !== 'report') return no('op must be claim, report or release');
  if (claim === null) return no('a report needs its claim');
  const a = body.acquisition;
  if (!isObject(a) || a.v !== EXTERNAL_SOURCE_VERSION) return no('the report carries no version 1 acquisition');
  if (a.sourceId !== body.sourceId) return no('the acquisition is for another source');
  if (!revision(a.configRevision) || !revision(a.ownerEpoch) || !revision(a.acceptedRevision)) return no('the acquisition needs its config revision, epoch and accepted revision');
  if (typeof a.status !== 'string' || !STATUSES.has(a.status as AcquisitionStatus)) return no('the acquisition has no known status');
  if (typeof a.checkedAt !== 'string' || Number.isNaN(Date.parse(a.checkedAt))) return no('checkedAt must be a time');
  if (a.providerSequence !== undefined && (typeof a.providerSequence !== 'number' || !Number.isFinite(a.providerSequence))) return no('providerSequence must be a number');
  if (a.providerEventTime !== undefined && typeof a.providerEventTime !== 'string') return no('providerEventTime must be text');
  if (a.error !== undefined && typeof a.error !== 'string') return no('error must be text');
  if ((a.status === 'changed') !== ('payload' in a)) return no(a.status === 'changed' ? 'a changed report carries its payload' : 'only a changed report carries a payload');
  return { ok: true, envelope: { v: 1, op: 'report', sourceId: body.sourceId, claim, acquisition: a as unknown as ExternalAcquisition } };
}
