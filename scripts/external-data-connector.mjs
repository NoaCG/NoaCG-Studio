#!/usr/bin/env node
// THE TRUSTED JSON AGENT (docs/work-specs/playout-external-connectors/spec.md, phase E4.1; AC-1):
// a headless process that reads one provider's JSON over HTTPS and hands each read, accepted or
// not, to a sender. It runs on a qualified cloud worker, inside an Actions job or on a laptop,
// never as a Vercel function.
//
//   node scripts/external-data-connector.mjs --config <file.json> [--minutes <n>]
//   node scripts/external-data-connector.mjs --config <file.json> --export   # the shareable config
//
// The configuration is non-secret (src/control/externalSource.ts `parseConnectorConfig`). The
// bearer credential is read from the environment variable it names, held in memory only, sent
// only to the configured origin, and replaced by "[redacted]" in anything the agent writes. An
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
// THE SENDER SEAM. `send(acquisition)` receives every report: a changed payload, a payload-free
// "unchanged" receipt at most every 15 s, and every hold or failure. From the command line it
// writes one JSON line per report to stdout. Phase E4.2 replaces it with /api/data/source and the
// claim that supplies the owner epoch.

import { readFileSync } from 'node:fs';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './lib/tsResolve.mjs';

const { publicAddress } = await import('../api/_lib/feedFetch.ts');
const { addressRefusal } = await import('../src/control/feedSource.ts');
const { UNCHANGED_RECEIPT_MS, acceptRead, exportConnectorConfig, initialSourceState, nextDelayMs, parseConnectorConfig, readLimits, retryAfterMs } = await import(
  '../src/control/externalSource.ts'
);

export const MAX_REDIRECTS = 5;
const USER_AGENT = 'NoaCG-Studio-connector/1 (+https://noacg.studio)';
export const REDACTED = '[redacted]';

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
  const origin = new URL(config.endpoint).origin;
  let url = new URL(config.endpoint);
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
  if (config.credentialRef && !config.credentialBound) throw new Error(`this configuration was exported: bind ${config.credentialRef} on this machine before it reads (rebind)`);
  if (config.credentialRef && !credential) throw new Error(`the credential ${config.credentialRef} is not set on this machine`);
  if (config.mode === 'local' && !ca) throw new Error('a local destination needs its certificate authority');
  const redact = (text) => (credential ? String(text).split(credential).join(REDACTED) : String(text));
  const say = (text) => log(redact(text));

  let state = initialSourceState();
  let failures = 0;
  let inFlight = null;
  let controller = null;
  let timer = null;
  let stopped = false;
  let lastReceiptAt = -Infinity;
  let nextDelay = config.pollMs;

  async function read() {
    controller = new AbortController();
    const { signal } = controller;
    const abort = controller.abort.bind(controller);
    const deadline = clock.setTimeout(abort, limits.timeoutMs);
    // Aborted by the deadline or by stop(); a stopped read reports nothing (below).
    const timedOut = new Promise((resolve) => signal.addEventListener('abort', () => resolve(problem('failed', `the provider did not answer in ${limits.timeoutMs / 1000} seconds`)), { once: true }));
    let outcome;
    try {
      outcome = await Promise.race([readSource({ config, credential, net, maxBytes: limits.maxBytes, signal, now: clock.now, ca }), timedOut]);
    } catch (error) {
      outcome = signal.aborted ? await timedOut : problem('failed', `the provider could not be reached (${error?.code ?? error?.message ?? 'error'})`);
    } finally {
      clock.clearTimeout(deadline);
      if (!signal.aborted) abort();
    }
    if (stopped) return null;
    const now = clock.now();
    const accepted = acceptRead(config, state, outcome, { checkedAt: new Date(now).toISOString(), ownerEpoch });
    state = accepted.state;
    const { acquisition } = accepted;
    const transportFailed = acquisition.status === 'denied' || acquisition.status === 'refused' || acquisition.status === 'failed';
    failures = transportFailed ? failures + 1 : 0;
    nextDelay = nextDelayMs(config.pollMs, failures, outcome.retryMs ?? null, random());
    say(`${acquisition.checkedAt} ${config.sourceId} ${acquisition.status} accepted=${acquisition.acceptedRevision}${acquisition.error ? ` ${acquisition.error}` : ''} next=${nextDelay}ms`);
    const report = acquisition.status !== 'unchanged' || now - lastReceiptAt >= UNCHANGED_RECEIPT_MS;
    if (acquisition.status === 'unchanged' && report) lastReceiptAt = now;
    if (acquisition.status === 'changed') lastReceiptAt = now;
    if (report) {
      try {
        await send(acquisition);
      } catch (error) {
        say(`${config.sourceId} the sender failed: ${error?.message ?? error}`);
      }
    }
    return acquisition;
  }

  /** One read now; a second call while one is in flight shares it. Answers null once stopped. */
  function readOnce() {
    if (!inFlight) inFlight = read().finally(() => (inFlight = null));
    return inFlight;
  }

  async function loop() {
    timer = null;
    if (stopped) return;
    try {
      await readOnce();
    } catch (error) {
      // A fault of the agent's own (the log's stream gone, say) must not end the polling.
      failures += 1;
      nextDelay = nextDelayMs(config.pollMs, failures, null, random());
      say(`${config.sourceId} the read failed inside the agent: ${error?.message ?? error}`);
    }
    if (!stopped) timer = clock.setTimeout(loop, nextDelay);
  }

  return {
    readOnce,
    /** Read now and then on the schedule, until `stop`. */
    start: () => loop(),
    stop: () => {
      stopped = true;
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
      controller?.abort();
    },
    get state() {
      return { ...state, failures, nextDelayMs: nextDelay };
    },
    exportConfig: () => exportConnectorConfig(config),
    redact,
  };
}

// ── From the command line ─────────────────────────────────────────────────────

function argument(argv, name) {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const file = argument(argv, '--config');
  if (!file) throw new Error('usage: external-data-connector.mjs --config <file.json> [--minutes <n>] [--export]');
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
  const credential = config.credentialRef ? (env[config.credentialRef] ?? null) : null;
  const redact = (text) => (credential ? text.split(credential).join(REDACTED) : text);
  const connector = createConnector({
    config,
    credential,
    // An unbound export is refused by createConnector before its certificate is looked for.
    ca: config.caFile && config.credentialBound ? readFileSync(path.resolve(path.dirname(file), config.caFile)) : null,
    limits: readLimits({ timeoutMs: env.NOACG_CONNECTOR_TIMEOUT_MS, maxBytes: env.NOACG_CONNECTOR_MAX_BYTES }),
    // A provider that echoes the credential in its body cannot put it on stdout either.
    send: async (acquisition) => void process.stdout.write(`${redact(JSON.stringify(acquisition))}\n`),
    log: (line) => process.stderr.write(`${line}\n`),
  });
  const done = new Promise((resolve) => {
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, resolve);
    if (minutes > 0) setTimeout(resolve, minutes * 60_000);
  });
  connector.start();
  await done;
  connector.stop();
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
