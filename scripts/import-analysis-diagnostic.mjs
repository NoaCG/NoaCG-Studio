#!/usr/bin/env node
// The ONE owner-approved diagnostic request for #2022 (image analysis through the AI Gateway
// answers HTTP 400). Run only by .github/workflows/import-analysis-diagnostic.yml on main, in the
// protected `jev-svg-evaluation` environment, dispatched once by the coordinator.
//
// What it sends: exactly the request the production route builds
// (api/_lib/importAnalysis/request.ts), on the production route, schema and privacy policy
// (importAnalysisPolicy: zero data retention, no prompt training, providers from the env), over a
// SYNTHETIC picture drawn here - no user or holdout content. One attempt: no retry, no fallback,
// and a fetch that refuses a second call. The priced worst case must be at most $0.01 before
// anything is sent.
//
// What it keeps: the status, the gateway error type and code, and the provider message with
// long runs that could echo content redacted. Never headers, the key, or the request body.
//
//   node scripts/import-analysis-diagnostic.mjs --out <file>          (needs AI_GATEWAY_API_KEY)
//   node scripts/import-analysis-diagnostic.mjs --dry-run --out <file> (mock gateway, no key)

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

export const COST_CAP_USD = 0.01;
/** Per-image input-token bound, the one the jev-svg-eval image arm priced with. */
export const IMAGE_TOKEN_BOUND = 8_000;
export const ARTWORK = { width: 480, height: 270 };

// ---- Synthetic artwork: a plain lower third, drawn as pixels ----

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** A 480x270 RGB PNG: a dark backdrop, a lower-third bar with an accent block and two
 *  light "text line" strips. Deterministic, and nobody's artwork. */
export function synthesizeArtwork({ width, height } = ARTWORK) {
  const rects = [
    { x: 0, y: 0, w: width, h: height, rgb: [18, 22, 34] },
    { x: 24, y: 180, w: 300, h: 64, rgb: [235, 238, 245] },
    { x: 24, y: 180, w: 10, h: 64, rgb: [220, 60, 50] },
    { x: 46, y: 190, w: 180, h: 18, rgb: [30, 34, 48] },
    { x: 46, y: 216, w: 120, h: 12, rgb: [90, 96, 112] },
  ];
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      let rgb = rects[0].rgb;
      for (const r of rects) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) rgb = r.rgb;
      raw.set(rgb, row + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return { base64: png.toString('base64'), mediaType: 'image/png', width, height };
}

// ---- The recorded error ----

/** A gateway error identifier, kept only when it is a short token. */
const token = (value) => (typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(value) ? value : null);

/** The provider message with anything that could echo content or a credential removed: data
 *  URLs and long unbroken runs (base64, keys, ids), then capped. The prompt and schema are
 *  public in this repository and the picture is synthetic, so a schema path or field name the
 *  provider quotes is kept: it is the diagnosis. */
export function redactMessage(message) {
  if (typeof message !== 'string') return null;
  return message
    .replace(/data:[^\s"']+/gi, '[redacted data url]')
    .replace(/(?:Bearer\s+)?[A-Za-z0-9+/=_-]{40,}/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);
}

/** What a refused response's body says: OpenAI-compatible `{ error: { type, code, param,
 *  message } }`, with nested provider errors kept to the same fields. Nothing else is kept. */
export function sanitizedError(status, text) {
  const out = { status, type: null, code: null, param: null, message: null };
  try {
    if (text.length > 1_000_000) throw new Error('too large');
    const body = JSON.parse(text);
    const error = body && typeof body.error === 'object' && body.error !== null ? body.error : body;
    out.type = token(error?.type);
    out.code = token(typeof error?.code === 'number' ? String(error.code) : error?.code);
    out.param = token(error?.param);
    out.message = redactMessage(error?.message);
    // Any other string the error carries (a provider's nested detail), redacted the same way.
    const extra = Object.entries(error ?? {})
      .filter(([k, v]) => typeof v === 'string' && !['type', 'code', 'param', 'message'].includes(k))
      .slice(0, 6)
      .map(([k, v]) => [token(k) ?? 'field', redactMessage(v)?.slice(0, 600)]);
    if (extra.length) out.detail = Object.fromEntries(extra);
  } catch {
    out.message = redactMessage(text.slice(0, 2000));
  }
  return out;
}

/** A fetch that sends at most ONE request and records its refusal. */
export function oneShotFetch(fetchImpl) {
  const state = { calls: 0, status: null, error: null };
  const wrapped = async (url, init) => {
    state.calls += 1;
    if (state.calls > 1) throw new Error('one request only: a second call was refused before sending');
    const response = await fetchImpl(url, init);
    state.status = response.status;
    if (!response.ok) state.error = sanitizedError(response.status, await response.clone().text().catch(() => ''));
    return response;
  };
  return { state, fetch: wrapped };
}

// ---- The request ----

/** The priced worst case: every text byte of the request as one token, plus the image bound,
 *  plus the full output allowance. Deliberately loose; it only has to stay under the cap. */
export function worstCaseUsd(modelRequest, price) {
  const text = JSON.stringify(modelRequest, (k, v) => (k === 'data' ? '' : v));
  const input = Buffer.byteLength(text, 'utf8') + IMAGE_TOKEN_BOUND;
  return (input * price.inputPerMillion + (modelRequest.maxTokens ?? 0) * price.outputPerMillion) / 1_000_000;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function loadServer() {
  const { buildApiRuntime } = await import('./api-runtime-build.mjs');
  const sources = ['api/_lib/importAnalysis/request.ts', 'api/_lib/aiGateway.ts', 'api/_lib/aiImportAnalysisProfile.ts'];
  const runtime = await buildApiRuntime(sources);
  const load = (rel) => import(pathToFileURL(path.join(runtime.outputDir, rel.replace(/\.ts$/, '.js'))).href);
  const [request, gateway, profile] = await Promise.all(sources.map(load));
  return { request, gateway, profile, cleanup: runtime.cleanup };
}

/** Plan and send the one request. Returns the record to keep; never throws for a refusal. */
export async function diagnose(server, { key, fetchImpl }) {
  const profile = server.profile.importAnalysisProfile();
  const policy = server.profile.importAnalysisPolicy(profile);
  const price = server.profile.importAnalysisPrice(profile);
  const base = {
    route: profile.route,
    policy: policy ? { zeroDataRetention: policy.zeroDataRetention, disallowPromptTraining: policy.disallowPromptTraining, only: policy.only, sort: policy.sort ?? null } : null,
  };
  if (!policy || !price) return { ...base, sent: false, refused: 'not-configured: no gateway policy or catalog price for the route' };
  if (!policy.zeroDataRetention || !policy.disallowPromptTraining) return { ...base, sent: false, refused: 'privacy: zero data retention and no prompt training are required' };
  const artwork = synthesizeArtwork();
  const modelRequest = server.request.importAnalysisModelRequest({ image: artwork, instructions: '' }, profile);
  const maxUsd = worstCaseUsd(modelRequest, price);
  const planned = { ...base, artwork: { mediaType: artwork.mediaType, width: artwork.width, height: artwork.height, base64Chars: artwork.base64.length }, maxUsd: Number(maxUsd.toFixed(6)), capUsd: COST_CAP_USD };
  if (!(maxUsd <= COST_CAP_USD)) return { ...planned, sent: false, refused: 'cost-cap' };
  if (!key) return { ...planned, sent: false, refused: 'no-key' };

  const shot = oneShotFetch(fetchImpl);
  const started = Date.now();
  try {
    const result = await server.gateway.executeGatewayRequest(
      { request: modelRequest, route: profile.route },
      { keyFor: async () => key, fetchImpl: shot.fetch, sleep: async () => {} },
      { maxAttempts: 1, retryLimit: 0, timeoutMs: 60_000, gateway: { ...policy, tags: ['surface:import-analysis-diagnostic'] } },
    );
    const output = result.output ?? {};
    return {
      ...planned, sent: true, requests: shot.state.calls, ms: Date.now() - started, status: shot.state.status, outcome: 'success',
      usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, costUsd: result.usage.estimatedCost?.amount ?? null },
      answer: { graphicType: output.graphicType ?? null, regions: Array.isArray(output.regions) ? output.regions.length : null },
    };
  } catch (error) {
    return {
      ...planned, sent: shot.state.calls > 0, requests: shot.state.calls, ms: Date.now() - started, status: shot.state.status, outcome: 'refused',
      classified: typeof error?.code === 'string' ? error.code : 'unknown',
      provider: shot.state.error,
    };
  }
}

/** The dry run's gateway: refuses the way #2022 observed, so the record path is exercised. */
export function mockGateway() {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    if (!String(url).endsWith('/chat/completions') || !body.providerOptions?.gateway?.zeroDataRetention) {
      return new Response('{}', { status: 500 });
    }
    return new Response(JSON.stringify({ error: { type: 'AI_APICallError', message: `mock refusal; schema keys ${Object.keys(body.response_format?.json_schema?.schema?.properties ?? {}).length}` } }), { status: 400 });
  };
}

async function main(argv) {
  const out = argv[argv.indexOf('--out') + 1];
  if (!argv.includes('--out') || !out) throw new Error('usage: --out <file> [--dry-run]');
  const dry = argv.includes('--dry-run');
  const server = await loadServer();
  try {
    const record = await diagnose(server, dry
      ? { key: 'mock-key', fetchImpl: mockGateway() }
      : { key: process.env.AI_GATEWAY_API_KEY ?? '', fetchImpl: fetch });
    const kept = { issue: 2022, dryRun: dry, at: new Date().toISOString(), ...record };
    writeFileSync(path.resolve(repoRoot, out), `${JSON.stringify(kept, null, 2)}\n`);
    console.log(JSON.stringify(kept, null, 2));
    if (!record.sent && record.refused) process.exitCode = 1;
  } finally {
    await server.cleanup();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
