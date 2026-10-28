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
// `timeline: 'package'` serves the election rehearsal package's own results instead
// (packs/election-rehearsal/starter, phase E7.2b): the same eight steps, in a provider's shape
// that the package's E5 recipe maps (votes as numbers, the time of the count as `observed_at`,
// the candidates as one collection `{schemaRevision, revision, items}` keyed by district plus
// candidate). Revision 3 corrects Aino Example and the Coalition downward, revision 4 drops Sara
// Example (02/103) and corrects Aino again, revision 5 has no candidates; 4 and 5 change nothing
// but the candidates.
//
// The timeline starts at the first authorized read, so an agent that is slow to boot still sees
// step 0; then the step is (clock() - start) / stepMs, held at the last, so it is exact under a
// fake clock, and `at(i)` moves it by hand. It runs beside the agent with a certificate made for that
// run only (`makeTestCertificate`, by openssl), so the agent keeps TLS validation on by trusting
// just that one. Never a Vercel function (the function budget, docs/DEPLOYMENT.md).
//
//   node scripts/election-replay-server.mjs [--port <n>] [--step-ms <n>] [--timeline package] [--from-step <n>] --dir <folder>
//
// `--from-step` starts the timeline at that step at once (a restarted server resuming a rehearsal).
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

const PACKAGE_STARTER = path.join(ROOT, 'packs/election-rehearsal/starter');
/** The candidate the package timeline drops at revision 4: district and candidate number. */
export const PACKAGE_DELETED = ['02', 103];

/** One count of the package as a provider would answer it. */
function providerCount(file, revision, observedAt) {
  const { summary, parties, candidates } = JSON.parse(readFileSync(path.join(PACKAGE_STARTER, file), 'utf8')).external.election;
  // The time of the count is the provider's `observed_at`; the package's recipe formats it.
  const counted = { ...summary };
  delete counted.updated;
  return {
    fixture: true,
    note: 'Synthetic rehearsal results. Not an election count.',
    revision,
    observed_at: observedAt,
    summary: counted,
    parties: Object.fromEntries(Object.entries(parties).map(([code, p]) => [code, { share: p.share, votes: Number(p.votes.replace(/,/g, '')) }])),
    candidates: { ...candidates, revision },
  };
}

/** The package timeline (E7.2b): the starter's two counts, then the same events as the research one. */
export function packageTimeline() {
  const text = (doc) => `${JSON.stringify(doc, null, 2)}\n`;
  const first = providerCount('revision-1.json', 1, '2027-02-20T18:14:00Z');
  const second = providerCount('revision-2.json', 2, '2027-02-20T18:31:00Z');
  /** The next count: a copy of `previous` at `revision` (the document's and its collection's). */
  const next = (previous, revision, edit) => {
    const doc = structuredClone(previous);
    doc.revision = doc.candidates.revision = revision;
    edit(doc);
    return doc;
  };
  const rev3 = next(second, 3, (d) => {
    d.observed_at = '2027-02-20T18:33:00Z';
    d.candidates.items.find((c) => c.district === '02' && c.candidate === 101).votes = 3650;
    d.parties.KOK = { share: '22.3%', votes: 224_100 };
  });
  // Revisions 4 and 5 change the candidates alone (the time of the count stays), so nothing a
  // field binds moves: the page hears them only from its own read of the tree.
  const rev4 = next(rev3, 4, (d) => {
    d.candidates.items = d.candidates.items.filter((c) => !(c.district === PACKAGE_DELETED[0] && c.candidate === PACKAGE_DELETED[1]));
    d.candidates.items.find((c) => c.district === '02' && c.candidate === 101).votes = 3640;
  });
  const rev5 = next(rev4, 5, (d) => {
    d.candidates.items = [];
  });
  const correction = text(rev3);
  return [
    { name: 'count-01', text: text(first) },
    { name: 'count-increase', text: text(second) },
    { name: 'duplicate', text: text(second) },
    { name: 'correction-down', text: correction },
    { name: 'older', text: text(first) },
    { name: 'malformed', text: correction.slice(0, Math.floor(correction.length / 2)) },
    { name: 'person-deleted', text: text(rev4) },
    { name: 'empty-collection', text: text(rev5) },
  ];
}

const digest = (text) => createHash('sha256').update(String(text)).digest();

/**
 * Start the server. `token` is the bearer credential it accepts, `cert`/`key` its PEM pair.
 * Answers `{ url, step(), at(i), close() }`; `url` is the /results address.
 */
export async function startReplayServer({ token, cert, key, clock = Date.now, stepMs = DEFAULT_STEP_MS, host = '127.0.0.1', port = 0, timeline = 'research', onStep = () => {} }) {
  if (!token) throw new Error('the replay server needs a bearer token');
  if (!(Number.isFinite(stepMs) && stepMs > 0)) throw new Error('stepMs must be a positive number of milliseconds');
  // A timeline of its own (`{ length, at(i) }`, the endurance run's) makes each step's text when asked.
  const custom = typeof timeline === 'object' && timeline !== null;
  if (!custom && timeline !== 'research' && timeline !== 'package') throw new Error('timeline must be research, package or { length, at(i) }');
  if (custom && !(Number.isInteger(timeline.length) && timeline.length > 0 && typeof timeline.at === 'function')) throw new Error('a timeline of its own needs a length and at(i)');
  const fixed = custom ? null : timeline === 'package' ? packageTimeline() : replayTimeline();
  const steps = custom ? { length: timeline.length, at: (i) => timeline.at(i) } : { length: fixed.length, at: (i) => fixed[i] };
  const expected = digest(`Bearer ${token}`);
  let start = null;
  let served = -1;
  const step = () => (start === null ? 0 : Math.min(steps.length - 1, Math.max(0, Math.floor((clock() - start) / stepMs))));
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
    if (start === null) start = clock();
    const at = step();
    // The first read of each step, so a person can time a step from the moment it was served.
    if (at !== served) {
      served = at;
      onStep(steps.at(at).name, clock());
    }
    const { name, text } = steps.at(at);
    answer(res, 200, text, { 'x-replay-step': name });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const { port: bound } = server.address();
  return {
    url: `https://${host.includes(':') ? `[${host}]` : host}:${bound}/results`,
    steps: fixed ? fixed.map((s) => s.name) : null,
    /** Each step's text by its sha256, as the rehearsal record names it. */
    digests: fixed ? fixed.map((s) => ({ name: s.name, sha256: digest(s.text).toString('hex') })) : null,
    step: () => steps.at(step()).name,
    /** The index of the step served now. */
    index: () => step(),
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
    process.stderr.write('usage: election-replay-server.mjs --dir <folder> [--port <n>] [--step-ms <n>] [--timeline package]\n');
    process.exit(1);
  }
  const { cert, key, certFile } = makeTestCertificate(dir);
  const token = makeToken();
  writeFileSync(path.join(dir, 'token'), token, { mode: 0o600 });
  const server = await startReplayServer({
    token,
    cert,
    key,
    port: Number(arg('--port') ?? 0),
    stepMs: Number(arg('--step-ms') ?? DEFAULT_STEP_MS),
    timeline: arg('--timeline') ?? 'research',
    onStep: (name, at) => process.stdout.write(`served ${name} at ${new Date(at).toISOString()}\n`),
  });
  process.stdout.write(`replay server at ${server.url}\ncertificate ${certFile}\ntoken in ${path.join(dir, 'token')}\n`);
  // What the rehearsal record names: each step's text by its sha256 (docs/work-specs/
  // playout-election-package/rehearsal.md).
  for (const s of server.digests) process.stdout.write(`step ${s.name} sha256 ${s.sha256}\n`);
  const from = arg('--from-step');
  if (from !== undefined) {
    const i = Number(from);
    if (!Number.isInteger(i) || i < 0 || i >= server.steps.length) throw new Error(`--from-step is 0 to ${server.steps.length - 1}`);
    server.at(i);
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close().then(() => process.exit(0)));
}
