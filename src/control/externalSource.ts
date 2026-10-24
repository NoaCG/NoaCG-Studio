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
// read-only (spec, "Storage, version gate and rollback"). Sending it to /api/data/source, the
// claim through C2's lease and the server's ingress limits are phase E4.2's.
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
  /** The environment variable holding the bearer credential, or null for none. */
  credentialRef: string | null;
  /** False on an exported configuration until this machine binds its own credential. */
  credentialBound: boolean;
  pollMs: number;
  /** The provider's documented minimum interval, when it has one. */
  providerMinPollMs: number | null;
  /** Where the provider's own revision or sequence number is in its JSON (dotted path). */
  revisionPath: string | null;
  /** Where the provider's own event time is in its JSON (dotted path). */
  eventTimePath: string | null;
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
]);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const ENV_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
const PATH = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
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
  if (typeof raw.sourceId !== 'string' || !ID.test(raw.sourceId)) return no('sourceId must be a short identifier');
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
  const credentialRef = raw.credentialRef || null;
  if (credentialRef !== null && !ENV_NAME.test(credentialRef)) return no('credentialRef must be an environment variable name');
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
      credentialBound: credentialRef === null ? true : raw.credentialBound !== false,
      pollMs,
      providerMinPollMs,
      revisionPath: (raw.revisionPath as string | null | undefined) || null,
      eventTimePath: (raw.eventTimePath as string | null | undefined) || null,
    },
  };
}

/** A configuration as it leaves this machine: the credential's name stays, the binding does not.
 *  Only known fields are copied. */
export function exportConnectorConfig(config: ConnectorConfig): ConnectorConfig {
  return {
    v: 1,
    sourceId: config.sourceId,
    productionId: config.productionId,
    endpoint: config.endpoint,
    mode: config.mode,
    caFile: config.caFile,
    configRevision: config.configRevision,
    credentialRef: config.credentialRef,
    credentialBound: config.credentialRef === null,
    pollMs: config.pollMs,
    providerMinPollMs: config.providerMinPollMs,
    revisionPath: config.revisionPath,
    eventTimePath: config.eventTimePath,
  };
}

/** Bind this machine's credential to a configuration (a new name, or the same one confirmed). */
export function bindConnectorCredential(config: ConnectorConfig, credentialRef: string): ConnectorConfig {
  if (!ENV_NAME.test(credentialRef)) throw new Error('credentialRef must be an environment variable name');
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
}

export const initialSourceState = (): SourceState => ({ acceptedRevision: 0, providerSequence: null, acceptedText: null });

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

function atPath(value: JsonValue, path: string | null): JsonValue | undefined {
  if (!path) return undefined;
  let at: JsonValue | undefined = value;
  for (const key of path.split('.')) {
    if (at === null || typeof at !== 'object' || Array.isArray(at) || !(key in at)) return undefined;
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
  config: Pick<ConnectorConfig, 'sourceId' | 'configRevision' | 'revisionPath' | 'eventTimePath'>,
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
  const text = canonicalJson(payload);
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
  if (sequence !== null && state.providerSequence !== null) {
    if (sequence < state.providerSequence) return hold('stale', `revision ${sequence} is older than the accepted ${state.providerSequence}`);
    if (sequence === state.providerSequence && text !== state.acceptedText) return hold('stale', `revision ${sequence} came again with other content`);
  }
  if (text === state.acceptedText) return { acquisition: { ...base, ...provider, acceptedRevision: state.acceptedRevision, status: 'unchanged' }, state };
  const next: SourceState = { acceptedRevision: state.acceptedRevision + 1, providerSequence: sequence, acceptedText: text };
  return { acquisition: { ...base, ...provider, acceptedRevision: next.acceptedRevision, status: 'changed', payload }, state: next };
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
 * of 50-100 % (`random` is in [0, 1)); never sooner than the provider's Retry-After, which itself
 * counts only up to RETRY_AFTER_CAP_MS.
 */
export function nextDelayMs(pollMs: number, failures: number, retryAfter: number | null, random: number): number {
  const backoff = failures <= 0 ? pollMs : Math.min(BACKOFF_CAP_MS, pollMs * 2 ** failures) * (0.5 + 0.5 * random);
  const asked = retryAfter === null ? 0 : Math.min(RETRY_AFTER_CAP_MS, retryAfter);
  return Math.round(Math.max(backoff, asked));
}
