#!/usr/bin/env node
// THE TRUSTED JSON AGENT (docs/work-specs/playout-external-connectors/spec.md, phase E4.1; AC-1):
// a headless process that reads one provider's JSON over HTTPS and hands each read, accepted or
// not, to a sender. It runs on a qualified cloud worker, inside an Actions job or on a laptop,
// never as a Vercel function.
//
//   node scripts/external-data-connector.mjs --config <file.json> [--minutes <n>] [--send <https://.../api/data/source>]
//   node scripts/external-data-connector.mjs --config <file.json> --export   # the shareable config
//
// The configuration is non-secret (src/control/externalSource.ts `parseConnectorConfig`). The
// bearer credential is read from the environment variable it names (NOACG_SOURCE_...), held in
// memory only, sent only to the configured origin, and replaced by "[redacted]" in anything the
// agent writes. An
// exported configuration keeps the variable's name and is unbound: the agent refuses it until
// the importing machine binds its own credential.
//
// One read: GET, no body, JSON, an optional bearer header, at most one in flight. 10 s for the
// whole read and 2 MiB of body by default; trusted deployment settings may move them inside the
// recorded envelope (NOACG_CONNECTOR_TIMEOUT_MS, NOACG_CONNECTOR_MAX_BYTES), the config cannot.
// Every 5 s by default; after a failure exponential backoff with jitter capped at 60 s, never
// sooner than Retry-After, and no queue of missed reads.
//
// Where it reads. `hosted` reuses the feed reader's guard (api/_lib/feedFetch.ts `publicAddress`,
// src/control/feedSource.ts `addressRefusal`): own port only, every DNS answer public, the
// connection pinned to the checked address, every redirect checked again, at most five. The read
// loop itself is not `guardedFetch`: that one has a feed's Accept header, a 5 MB cap and no way to
// add an Authorization header or a certificate authority, and api/ is phase E4.2's to change.
// `local` is an explicitly configured destination (a replay server beside the agent): only its
// origin, checked against the run's own certificate authority, so TLS validation stays on.
//
// THE SENDER SEAM. `send(acquisition)` receives every report: a changed payload (only its
// `sendPaths`), a payload-free "unchanged" receipt at most every 15 s after the last one the sender
// took, and every hold or failure.
// From the command line it writes one JSON line per report to stdout, or, with `--send <address>`
// and the production's data key in NOACG_DATA_KEY, posts it to /api/data/source
// (`createSourceSender`, phase E4.2): the agent first CLAIMS the registered source through C2's
// lease and continues from the owner epoch, accepted revision and provider sequence the production
// answers (`adopt`), so a restarted agent never reuses an epoch or a revision. The database fences
// every report; the sender alone prevents nothing. When the production answers a claim or a report
// with `sample: true` (the page's Connect review asked, E5.2), the agent reads the provider once
// more and posts what it would send as `op: "sample"`, under its claim: kept for the review, never
// a revision and never applied.

import { readFileSync } from 'node:fs';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './lib/tsResolve.mjs';

const { publicAddress } = await import('../api/_lib/feedFetch.ts');
const { addressRefusal } = await import('../src/control/feedSource.ts');
const { EXTERNAL_SOURCE_VERSION, SOURCE_LEASE_MS, UNCHANGED_RECEIPT_MS, acceptRead, exportConnectorConfig, initialSourceState, nextDelayMs, parseConnectorConfig, projectPayload, readLimits, retryAfterMs } = await import(
  '../src/control/externalSource.ts'
);

export const MAX_REDIRECTS = 5;
const USER_AGENT = 'NoaCG-Studio-connector/1 (+https://noacg.studio)';
export const REDACTED = '[redacted]';
const TIMEOUT = 'timeout';
const STOPPED = 'stopped';
const DONE = 'done';

/** Refuse an exported configuration until this machine binds its own credential. */
export function assertBound(config) {
  if (config.credentialRef && !config.credentialBound) throw new Error(`this configuration is not bound on this machine (an export, say): bind ${config.credentialRef} here before it reads (rebind)`);
}

// ── The network ───────────────────────────────────────────────────────────────

/** Node's own network, pinned to the checked address. `ca` replaces the system's authorities. */
export const nodeNet = {
  lookup: async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((a) => ({ address: a.address, family: a.family })),
  request: ({ url, address, family, headers, signal, ca }) =>
    new Promise((resolve, reject) => {
      const req = httpsRequest(
        url,
        {
          method: 'GET',
          headers,
          signal,
          ...(ca ? { ca } : {}),
          lookup: (_host, options, callback) => (options?.all ? callback(null, [{ address, family }]) : callback(null, address, family)),
        },
        (res) => {
          const flat = {};
          for (const [k, v] of Object.entries(res.headers)) flat[k] = Array.isArray(v) ? v.join(', ') : v;
          resolve({ status: res.statusCode ?? 0, headers: flat, body: res, cancel: () => res.destroy() });
        },
      );
      req.on('error', reject);
      req.end();
    }),
};

/** The real clock, in the shape the fake one in the test has. */
export const realClock = { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (handle) => clearTimeout(handle) };

function underSignal(promise, signal) {
  if (signal.aborted) return Promise.reject(new Error('aborted'));
  return new Promise((resolve, reject) => {
    const stop = () => reject(new Error('aborted'));
    signal.addEventListener('abort', stop, { once: true });
    promise.then(
      (value) => (signal.removeEventListener('abort', stop), resolve(value)),
      (error) => (signal.removeEventListener('abort', stop), reject(error)),
    );
  });
}

// ── One read ──────────────────────────────────────────────────────────────────

const problem = (status, error, retryMs = null) => ({ kind: 'problem', status, error, retryMs });

/**
 * Read the configured endpoint once, under the guard its mode asks for. Answers a
 * `ReadOutcome` (src/control/externalSource.ts) plus the provider's Retry-After in ms.
 */
export async function readSource({ config, credential, net, maxBytes, signal, now, ca = null }) {
  let url = new URL(config.endpoint);
  const { origin } = url;
  const headers = { accept: 'application/json', 'accept-encoding': 'identity', 'user-agent': USER_AGENT };
  for (let hop = 0; ; hop += 1) {
    const where = hop === 0 ? 'the endpoint' : 'it redirects to an address that';
    if (url.protocol !== 'https:') return problem('refused', `${where} is not https`);
    if (config.mode === 'local') {
      if (url.origin !== origin) return problem('refused', `${where} is outside the configured local destination`);
    } else {
      const why = addressRefusal(url);
      if (why) return problem('refused', `${where} cannot be read: ${why.replace(/\.$/, '')}`);
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const answers = isIP(host) ? [{ address: host, family: isIP(host) }] : await underSignal(net.lookup(host), signal);
    if (answers.length === 0) return problem('failed', 'that address does not exist');
    if (config.mode === 'hosted' && !answers.every((a) => publicAddress(a.address))) return problem('refused', `${where} is not on the public internet`);
    const { address, family } = answers.find((a) => a.family === 4) ?? answers[0];
    // The credential goes to the configured origin only, never along a redirect elsewhere.
    const sent = credential && url.origin === origin ? { ...headers, authorization: `Bearer ${credential}` } : headers;
    const response = await underSignal(net.request({ url, address, family, headers: sent, signal, ca }), signal);
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      response.cancel();
      if (hop >= MAX_REDIRECTS) return problem('refused', `it redirects more than ${MAX_REDIRECTS} times`);
      url = new URL(response.headers.location, url);
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      response.cancel();
      return problem('denied', `the provider refused the credential (${response.status})`);
    }
    if (response.status < 200 || response.status >= 300) {
      response.cancel();
      return problem('failed', `the provider answered ${response.status}`, retryAfterMs(response.headers['retry-after'], now()));
    }
    const tooLarge = problem('failed', `the answer is larger than ${maxBytes} bytes`);
    const declared = Number(response.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      response.cancel();
      return tooLarge;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > maxBytes) {
        response.cancel();
        return tooLarge;
      }
      chunks.push(chunk);
    }
    return { kind: 'body', text: new TextDecoder('utf-8').decode(Buffer.concat(chunks, size)), retryMs: null };
  }
}

// ── The connector ─────────────────────────────────────────────────────────────

/**
 * One source's agent. `credential` is the secret itself (the CLI reads it from the environment
 * variable the config names). Throws when the config is unbound or its credential is missing.
 */
export function createConnector({ config, credential = null, net = nodeNet, clock = realClock, random = Math.random, send = async () => {}, log = () => {}, limits = readLimits(), ownerEpoch = 0, ca = null }) {
  assertBound(config);
  if (config.credentialRef && !credential) throw new Error(`the credential ${config.credentialRef} is not set on this machine`);
  if (config.mode === 'local' && !ca) throw new Error('a local destination needs its certificate authority');
  const redact = (text) => (credential ? String(text).split(credential).join(REDACTED) : String(text));
  const say = (text) => {
    // A log that cannot be written (its stream gone) must not stop the reading.
    try {
      log(redact(text));
    } catch {
      /* nothing to tell it with */
    }
  };
  // Redacted once here, at the seam, so no sender has to remember: a provider that echoes the
  // credential in its answer cannot pass it on. Strings are redacted where they stand, so the
  // value stays valid JSON; a number is data, never a bearer header's text.
  const redactValue = (value) => {
    if (typeof value === 'string') return redact(value);
    if (Array.isArray(value)) return value.map(redactValue);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [redact(k), redactValue(v)]));
    return value;
  };
  const deliver = (acquisition) => send(credential && JSON.stringify(acquisition).includes(credential) ? redactValue(acquisition) : acquisition);
  const offer = async (acquisition) => {
    try {
      await deliver(acquisition);
      return true;
    } catch (error) {
      // The network's own reason too (a reset socket, a refused connection): fetch says only "fetch failed".
      const cause = error?.cause?.code ?? error?.cause?.message;
      say(`${config.sourceId} the sender failed: ${error?.message ?? error}${cause ? ` (${cause})` : ''}`);
      return false;
    }
  };

  let state = initialSourceState();
  let failures = 0;
  let inFlight = null;
  let controller = null;
  let timer = null;
  let stopped = false;
  let lastReceiptAt = -Infinity;
  let nextDelay = config.pollMs;
  /** An accepted revision the sender has not taken yet: offered again until it is. */
  let undelivered = null;
  let epoch = ownerEpoch;

  /** Reads in flight now, and the most at once since the backlog was last asked (the endurance run). */
  let reading = 0;
  let readingPeak = 0;
  async function read() {
    reading++;
    readingPeak = Math.max(readingPeak, reading);
    try {
      return await readNow();
    } finally {
      reading--;
    }
  }

  async function readNow() {
    const own = new AbortController();
    controller = own;
    const { signal } = own;
    const deadline = clock.setTimeout(() => own.abort(TIMEOUT), limits.timeoutMs);
    // The deadline is a failed read; stop() (any other reason) ends the read with no report.
    const aborted = new Promise((resolve) =>
      signal.addEventListener('abort', () => resolve(signal.reason === TIMEOUT ? problem('failed', `the provider did not answer in ${limits.timeoutMs / 1000} seconds`) : null), { once: true }),
    );
    let outcome;
    try {
      outcome = await Promise.race([readSource({ config, credential, net, maxBytes: limits.maxBytes, signal, now: clock.now, ca }), aborted]);
    } catch (error) {
      outcome = signal.aborted ? await aborted : problem('failed', `the provider could not be reached (${error?.code ?? error?.message ?? 'error'})`);
    } finally {
      clock.clearTimeout(deadline);
      own.abort(DONE);
    }
    if (outcome === null) return null;
    const now = clock.now();
    const accepted = acceptRead(config, state, outcome, { checkedAt: new Date(now).toISOString(), ownerEpoch: epoch });
    state = accepted.state;
    const { acquisition } = accepted;
    // Only the transport's problems back off; a stale or invalid answer is still an answer.
    failures = outcome.kind === 'problem' ? failures + 1 : 0;
    nextDelay = nextDelayMs(config.pollMs, failures, outcome.retryMs ?? null, random());
    say(`${acquisition.checkedAt} ${config.sourceId} ${acquisition.status} accepted=${acquisition.acceptedRevision}${acquisition.error ? ` ${acquisition.error}` : ''} next=${nextDelay}ms`);
    const report = acquisition.status !== 'unchanged' || now - lastReceiptAt >= UNCHANGED_RECEIPT_MS;
    // The 15 s run from when the last receipt was TAKEN, not from the read before it: the
    // production counts its own 15 s from its write, so a gap measured from the read lands a few
    // ms early there and is ignored (every other receipt lost).
    const taken = () => void (lastReceiptAt = clock.now());
    if (acquisition.status === 'changed') undelivered = null;
    if (undelivered) {
      if (await offer({ ...undelivered, checkedAt: acquisition.checkedAt })) {
        undelivered = null;
        taken();
      }
      // The payload offered again is this unchanged read's report.
      if (acquisition.status === 'unchanged') return acquisition;
    }
    if (report) {
      const delivered = await offer(acquisition);
      if (delivered && (acquisition.status === 'unchanged' || acquisition.status === 'changed')) taken();
      if (!delivered && acquisition.status === 'changed') undelivered = acquisition;
    }
    return acquisition;
  }

  /**
   * One read for the production's Connect review (E5.2, op `sample`): what this agent would send of
   * the provider's answer now (its `sendPaths`, redacted), or null when the read failed. Its own
   * read beside the loop's, with the same credential and limits; it changes no state and is never
   * a revision.
   */
  async function sample() {
    const own = new AbortController();
    const deadline = clock.setTimeout(() => own.abort(TIMEOUT), limits.timeoutMs);
    try {
      const outcome = await readSource({ config, credential, net, maxBytes: limits.maxBytes, signal: own.signal, now: clock.now, ca });
      if (outcome.kind !== 'body') {
        say(`${config.sourceId} sample not read: ${outcome.error}`);
        return null;
      }
      const sent = projectPayload(JSON.parse(outcome.text), config.sendPaths ?? null);
      return credential && JSON.stringify(sent).includes(credential) ? redactValue(sent) : sent;
    } catch (error) {
      say(`${config.sourceId} sample not read: ${own.signal.aborted ? 'the provider did not answer in time' : error?.message ?? error}`);
      return null;
    } finally {
      clock.clearTimeout(deadline);
      own.abort(DONE);
    }
  }

  /** One read now; a second call while one is in flight shares it. Answers null once stopped. */
  function readOnce() {
    if (!inFlight) inFlight = read().finally(() => (inFlight = null));
    return inFlight;
  }

  async function loop() {
    timer = null;
    if (stopped) return;
    await readOnce();
    if (!stopped) timer = clock.setTimeout(loop, nextDelay);
  }

  return {
    readOnce,
    sample,
    /** Read now and then on the schedule, until `stop`. */
    start: () => loop(),
    stop: () => {
      stopped = true;
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
      controller?.abort(STOPPED);
    },
    /**
     * Continue under a new claim: its epoch, and the revision and provider sequence the production
     * holds, so the next accepted read is above them. The next read is sent whole (the accepted
     * text is forgotten); anything made under the old epoch is not offered again.
     */
    adopt: ({ ownerEpoch: next, acceptedRevision, providerSequence }) => {
      epoch = next;
      state = { acceptedRevision, providerSequence: providerSequence ?? null, acceptedText: null, acceptedRaw: null };
      undelivered = null;
      lastReceiptAt = -Infinity;
    },
    get state() {
      return { ...state, failures, nextDelayMs: nextDelay, ownerEpoch: epoch };
    },
    /** What waits here (the endurance run's queue depth): the most reads in flight at once since
     *  the last ask, and the revisions kept to offer again. */
    backlog() {
      const peak = readingPeak;
      readingPeak = reading;
      return { reading: peak, undelivered: undelivered ? 1 : 0 };
    },
    exportConfig: () => exportConnectorConfig(config),
    redact,
  };
}

// ── To the production ─────────────────────────────────────────────────────────

/** A refusal the sender keeps the revision for (offered again at the next read). */
const RETRY = new Set(['paused', 'too_soon', 'budget']);
/** A refusal that ends the claim: the next report claims again. */
const RECLAIM = new Set(['moved', 'epoch', 'config', 'gone', 'unsupported', 'local_refused', 'registration']);
/** A server that did not answer: the claim stays, and a kept revision is offered again. */
const unanswered = (status) => status >= 500 || status === 429;

/**
 * The sender for /api/data/source. `connector` is told every new claim (`adopt`). Answers a `send`
 * for the connector's seam, `claim()` and `release()`. A report made under an older epoch than the
 * current claim is dropped, never sent. A send throws when the revision should be offered again.
 */
/** How long one request to the production may take, its answer's body included. */
export const POST_TIMEOUT_MS = 10_000;

export function createSourceSender({ address, key, config, fetchImpl = fetch, log = () => {}, clock = realClock, timeoutMs = POST_TIMEOUT_MS }) {
  let fence = null;
  let connector = null;
  /** When the production last answered a report (which renewed the lease). */
  let answeredAt = -Infinity;
  /** Before this, a kept revision is not sent: the production asked to wait (Retry-After). */
  let notBefore = -Infinity;
  /** Requests in flight, so shutdown can end them, and the most at once since last asked. */
  const inFlight = new Set();
  let postingPeak = 0;
  // A production that stalls must not stall the reading: the request and its answer end within
  // `timeoutMs` (an error, so a kept revision is offered again), and `abort()` ends them at shutdown.
  const post = async (body) => {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(new Error(`the production did not answer in ${timeoutMs / 1000} seconds`)), timeoutMs);
    inFlight.add(controller);
    postingPeak = Math.max(postingPeak, inFlight.size);
    try {
      const response = await fetchImpl(address, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let answer = {};
      try {
        answer = await response.json();
      } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason ?? error;
        /* not JSON: the status says enough */
      }
      return { status: response.status, answer };
    } finally {
      clearTimeout(deadline);
      inFlight.delete(controller);
    }
  };
  const base = { v: EXTERNAL_SOURCE_VERSION, sourceId: config.sourceId, configRevision: config.configRevision };
  /** A sample the production asked for (E5.2), one at a time: read by the connector, posted under
   *  the claim. Its answer changes nothing else. */
  let sampling = null;
  const asked = (answer) => {
    if (!answer?.sample || sampling || !connector?.sample) return;
    sampling = (async () => {
      const payload = await connector.sample();
      if (payload === null || !fence) return;
      const { status, answer: posted } = await post({ ...base, op: 'sample', claim: fence.claim, sample: payload });
      log(`${config.sourceId} sample ${status === 200 ? 'posted' : `not taken (${status}${posted.refused ? ` ${posted.refused}` : ''})`}`);
    })()
      .catch((error) => log(`${config.sourceId} sample failed: ${error?.message ?? error}`))
      .finally(() => (sampling = null));
  };

  async function claim() {
    const { status, answer } = await post({ ...base, op: 'claim', claim: fence?.claim ?? null });
    if (status === 200 && answer.ok) {
      const renewed = fence?.claim === answer.claim && fence?.ownerEpoch === answer.ownerEpoch;
      fence = { claim: answer.claim, ownerEpoch: answer.ownerEpoch };
      if (!renewed) {
        log(`${config.sourceId} claimed: epoch ${answer.ownerEpoch}, continuing after revision ${answer.acceptedRevision}`);
        connector?.adopt({ ownerEpoch: answer.ownerEpoch, acceptedRevision: answer.acceptedRevision, providerSequence: answer.providerSequence });
      }
      asked(answer);
      return true;
    }
    // A server that did not answer keeps the claim this agent holds; a refusal ends it.
    if (!unanswered(status)) fence = null;
    log(`${config.sourceId} not claimed (${status}${answer.refused ? ` ${answer.refused}` : answer.held ? ' held by another agent' : ''})`);
    return false;
  }

  async function send(acquisition) {
    if (!fence && !(await claim())) return;
    // Made before this claim: the adopted state sends the next read whole instead.
    if (acquisition.ownerEpoch !== fence.ownerEpoch) return;
    if (acquisition.status === 'changed' && clock.now() < notBefore) throw new Error('waiting as the production asked');
    const { status, answer } = await post({ ...base, op: 'report', claim: fence.claim, acquisition });
    if (status === 200) {
      answeredAt = clock.now();
      asked(answer);
      return;
    }
    const refused = answer.refused ?? (status === 401 || status === 403 ? 'denied' : null);
    if (RECLAIM.has(refused)) fence = null;
    if (Number.isFinite(answer.retryMs)) notBefore = clock.now() + answer.retryMs;
    log(`${config.sourceId} ${acquisition.status} revision ${acquisition.acceptedRevision} not taken (${status}${refused ? ` ${refused}` : ''})`);
    // Kept and offered again: a Pause, the 5 s gap, the shared budget, a fence to take again, or a
    // server that did not answer. Not kept: a revision the production already holds, one that
    // cannot fit (over 256 KiB, or a 64 KiB row), or an invalid report.
    if (acquisition.status === 'changed' && (RETRY.has(refused) || RECLAIM.has(refused) || unanswered(status))) {
      throw new Error(`not taken (${refused ?? status})`);
    }
  }

  async function release() {
    if (!fence) return;
    const held = fence;
    fence = null;
    await post({ ...base, op: 'release', claim: held.claim }).catch(() => {});
  }

  /**
   * Renew the claim every `ms` (a third of the lease) when no report was answered meanwhile, so a
   * slow poll or a long backoff never lets the lease lapse under a live agent. Answers the stop.
   */
  function keepClaim(ms = SOURCE_LEASE_MS / 3) {
    let timer = null;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      // A report answered within `ms` renewed the lease already.
      if (fence && clock.now() - answeredAt >= ms) await claim().catch((error) => log(`${config.sourceId} renewal failed: ${error?.message ?? error}`));
      if (!stopped) timer = clock.setTimeout(tick, ms);
    };
    timer = clock.setTimeout(tick, ms);
    return () => {
      stopped = true;
      if (timer !== null) clock.clearTimeout(timer);
    };
  }

  return {
    send,
    claim,
    release,
    keepClaim,
    /** The sample being read and posted, if any (a test waits on it). */
    get sampling() {
      return sampling;
    },
    /** The most requests to the production in flight at once since last asked (the endurance
     *  run's queue depth): a report, a claim's renewal and a sample can overlap, nothing more. */
    posting() {
      const peak = postingPeak;
      postingPeak = inFlight.size;
      return peak;
    },
    /** End every request in flight (shutdown). */
    abort: () => inFlight.forEach((c) => c.abort(new Error('stopped'))),
    bind: (c) => void (connector = c),
    get fence() {
      return fence;
    },
  };
}

// ── From the command line ─────────────────────────────────────────────────────

function argument(argv, name) {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const file = argument(argv, '--config');
  if (!file) throw new Error('usage: external-data-connector.mjs --config <file.json> [--minutes <n>] [--send <address>] [--export]');
  const parsed = parseConnectorConfig(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.ok) throw new Error(`the configuration is refused: ${parsed.error}`);
  const { config } = parsed;
  if (argv.includes('--export')) {
    process.stdout.write(`${JSON.stringify(exportConnectorConfig(config), null, 2)}\n`);
    return;
  }
  const minutes = Number(argument(argv, '--minutes') ?? 0);
  // setTimeout's own limit is about 24 days; a run longer than a week is not a run of this.
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 7 * 24 * 60) throw new Error('--minutes must be a number of minutes, at most a week');
  assertBound(config);
  const address = argument(argv, '--send');
  let sender = null;
  if (address !== undefined) {
    // The data key travels in this request: https, or plain http to this machine only (a local stack).
    let to;
    try {
      to = new URL(address);
    } catch {
      throw new Error('--send takes the address of /api/data/source');
    }
    if (to.protocol !== 'https:' && !(to.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(to.hostname))) {
      throw new Error('--send must be https (plain http only to this machine)');
    }
    if (!env.NOACG_DATA_KEY) throw new Error('set NOACG_DATA_KEY to the production data key before --send');
    sender = createSourceSender({ address, key: env.NOACG_DATA_KEY, config, log: (line) => process.stderr.write(`${line}\n`) });
  }
  const connector = createConnector({
    config,
    credential: config.credentialRef ? (env[config.credentialRef] ?? null) : null,
    ca: config.caFile ? readFileSync(path.resolve(path.dirname(file), config.caFile)) : null,
    limits: readLimits({ timeoutMs: env.NOACG_CONNECTOR_TIMEOUT_MS, maxBytes: env.NOACG_CONNECTOR_MAX_BYTES }),
    send: sender ? sender.send : async (acquisition) => void process.stdout.write(`${JSON.stringify(acquisition)}\n`),
    log: (line) => process.stderr.write(`${line}\n`),
  });
  sender?.bind(connector);
  // Claimed before the first read, so it is sent under the production's epoch; a claim refused
  // now is tried again at every report.
  await sender?.claim().catch((error) => process.stderr.write(`${config.sourceId} claim failed: ${error.message}\n`));
  const done = new Promise((resolve) => {
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, resolve);
    if (minutes > 0) setTimeout(resolve, minutes * 60_000);
  });
  const stopRenewing = sender?.keepClaim();
  // Spawned with an IPC channel (the endurance run), it answers what waits in it, and nothing else.
  const answerBacklog = (message) => message?.ask === 'backlog' && process.send?.({ id: message.id, backlog: { ...connector.backlog(), posting: sender?.posting() ?? 0 } });
  if (process.send) process.on('message', answerBacklog);
  connector.start();
  await done;
  connector.stop();
  stopRenewing?.();
  sender?.abort();
  await sender?.release();
  process.off('message', answerBacklog);
  process.disconnect?.();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    () => process.exit(0),
    (error) => {
      process.stderr.write(`external-data-connector: ${error.message}\n`);
      process.exit(1);
    },
  );
}
