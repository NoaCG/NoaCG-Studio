#!/usr/bin/env node
// THE ELECTION REPLAY SERVER (docs/work-specs/playout-external-connectors/spec.md, "Replay server
// and endurance workflow"; phase E4.1): the provider the trusted agent reads in place of real
// election results, which are not available to us. A small Node HTTPS server, bearer
// authenticated, answering GET /results with the recorded election fixtures on a timeline:
//
//   0 count-01           revision 1 (docs/research/2026-10-custom-graphics-workflow/election)
//   1 count-increase     revision 2, counts up
//   2 duplicate          revision 2 again, byte for byte
//   3 correction-down    revision 3, one candidate corrected downward
//   4 older              revision 1 again, arriving late
//   5 malformed          revision 3's text cut in half: not JSON
//   6 person-deleted     revision 4, candidate FI2027_02_104 gone from the list
//   7 empty-collection   revision 5, the candidate list valid and empty
//
// The step is (clock() - start) / stepMs, held at the last, so the timeline is exact under a fake
// clock and `at(i)` moves it by hand. It runs beside the agent with a certificate made for that
// run only (`makeTestCertificate`, by openssl), so the agent keeps TLS validation on by trusting
// just that one. Never a Vercel function (the function budget, docs/DEPLOYMENT.md).
//
//   node scripts/election-replay-server.mjs [--port <n>] [--step-ms <n>] --dir <folder>
//
// writes `ca.pem` and `token` (mode 0600) into the folder and prints the address, never the token.

import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURES = path.join(ROOT, 'docs/research/2026-10-custom-graphics-workflow/election/fixtures');
export const DELETED_PERSON = 'FI2027_02_104';
export const DEFAULT_STEP_MS = 5_000;

const fixture = (name) => readFileSync(path.join(FIXTURES, name), 'utf8');

/** The timeline's steps, each a name and the exact text served. */
export function replayTimeline() {
  const first = fixture('results-01.json');
  const second = fixture('results-02.json');
  const correction = fixture('results-03-correction.json');
  const rev3 = JSON.parse(correction);
  const rev4 = { ...rev3, revision: 4, observed_at: '2027-02-20T18:00:15Z', candidates: rev3.candidates.filter((c) => c.candidate_id !== DELETED_PERSON) };
  const rev5 = { ...rev4, revision: 5, observed_at: '2027-02-20T18:00:20Z', candidates: [] };
  return [
    { name: 'count-01', text: first },
    { name: 'count-increase', text: second },
    { name: 'duplicate', text: second },
    { name: 'correction-down', text: correction },
    { name: 'older', text: first },
    { name: 'malformed', text: correction.slice(0, Math.floor(correction.length / 2)) },
    { name: 'person-deleted', text: `${JSON.stringify(rev4, null, 2)}\n` },
    { name: 'empty-collection', text: `${JSON.stringify(rev5, null, 2)}\n` },
  ];
}

const digest = (text) => createHash('sha256').update(String(text)).digest();

/**
 * Start the server. `token` is the bearer credential it accepts, `cert`/`key` its PEM pair.
 * Answers `{ url, step(), at(i), close() }`; `url` is the /results address.
 */
export async function startReplayServer({ token, cert, key, clock = Date.now, stepMs = DEFAULT_STEP_MS, host = '127.0.0.1', port = 0 }) {
  if (!token) throw new Error('the replay server needs a bearer token');
  const steps = replayTimeline();
  const expected = digest(`Bearer ${token}`);
  let start = clock();
  const step = () => Math.min(steps.length - 1, Math.max(0, Math.floor((clock() - start) / stepMs)));
  const answer = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
    res.end(body);
  };
  const server = createServer({ cert, key }, (req, res) => {
    const pathname = new URL(req.url ?? '/', 'https://replay.invalid').pathname;
    if (pathname !== '/results') return answer(res, 404, '{"error":"not found"}');
    if (req.method !== 'GET') return answer(res, 405, '{"error":"GET only"}', { allow: 'GET' });
    // Compared as digests, so the comparison takes the same time whatever was sent.
    if (!timingSafeEqual(digest(req.headers.authorization ?? ''), expected)) return answer(res, 401, '{"error":"unauthorized"}', { 'www-authenticate': 'Bearer' });
    const { name, text } = steps[step()];
    answer(res, 200, text, { 'x-replay-step': name });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const { port: bound } = server.address();
  return {
    url: `https://${host.includes(':') ? `[${host}]` : host}:${bound}/results`,
    steps: steps.map((s) => s.name),
    step: () => steps[step()].name,
    /** Move the timeline to step `i` (from the clock's present reading). */
    at: (i) => void (start = clock() - i * stepMs),
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

/** A self-signed certificate for 127.0.0.1 and localhost, made for this run in `dir`. */
export function makeTestCertificate(dir) {
  mkdirSync(dir, { recursive: true });
  const keyFile = path.join(dir, 'key.pem');
  const certFile = path.join(dir, 'ca.pem');
  execFileSync(
    'openssl',
    ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost', '-keyout', keyFile, '-out', certFile],
    { stdio: 'ignore', windowsHide: true },
  );
  chmodSync(keyFile, 0o600);
  return { cert: readFileSync(certFile), key: readFileSync(keyFile), certFile };
}

/** A fresh bearer token. */
export const makeToken = () => randomBytes(32).toString('base64url');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const dir = arg('--dir');
  if (!dir) {
    process.stderr.write('usage: election-replay-server.mjs --dir <folder> [--port <n>] [--step-ms <n>]\n');
    process.exit(1);
  }
  const { cert, key, certFile } = makeTestCertificate(dir);
  const token = makeToken();
  writeFileSync(path.join(dir, 'token'), token, { mode: 0o600 });
  const server = await startReplayServer({ token, cert, key, port: Number(arg('--port') ?? 0), stepMs: Number(arg('--step-ms') ?? DEFAULT_STEP_MS) });
  process.stdout.write(`replay server at ${server.url}\ncertificate ${certFile}\ntoken in ${path.join(dir, 'token')}\n`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close().then(() => process.exit(0)));
}
