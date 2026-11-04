#!/usr/bin/env node
// The ONE owner-approved diagnostic request for #2022 (image analysis through the AI Gateway
// answers HTTP 400). Run only by .github/workflows/import-analysis-diagnostic.yml on main, in the
// protected `jev-svg-evaluation` environment, dispatched once by the coordinator.
//
// What it sends: exactly the request the production route builds
// (api/_lib/importAnalysis/request.ts), on the production route, schema and privacy policy
// (importAnalysisPolicy: zero data retention, no prompt training, providers from the env), over a
// SYNTHETIC JPEG fixture drawn from rectangles - no user or holdout content. One attempt: no retry, no fallback,
// and a fetch that refuses a second call. The priced worst case must be at most $0.01 before
// anything is sent.
//
// What it keeps: the status, the gateway error type and code, and the provider message with
// long runs that could echo content redacted. Never headers, the key, or the request body.
//
//   node scripts/import-analysis-diagnostic.mjs --out <file>          (needs AI_GATEWAY_API_KEY)
//   node scripts/import-analysis-diagnostic.mjs --dry-run --out <file> (mock gateway, no key)

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const COST_CAP_USD = 0.01;
/** Per-image input-token bound, the one the jev-svg-eval image arm priced with. */
export const IMAGE_TOKEN_BOUND = 8_000;
export const ARTWORK = { width: 480, height: 270 };

// ---- Synthetic artwork: a plain lower third, in production's image format ----

/** The browser always sends a JPEG (src/ai/importAnalysis/client.ts: canvas `image/jpeg` at
 *  quality 0.85), so the diagnostic does too. The fixture is a 480x270 baseline JPEG at quality
 *  85, drawn from rectangles only: a dark backdrop, a lower-third bar with an accent block and
 *  two "text line" strips. Nobody's artwork. Made with Pillow:
 *    Image.new('RGB', (480, 270), (18, 22, 34)); rectangles (24,180,300x64) (235,238,245),
 *    (24,180,10x64) (220,60,50), (46,190,180x18) (30,34,48), (46,216,120x12) (90,96,112);
 *    save('JPEG', quality=85, progressive=False). */
export const ARTWORK_PATH = 'scripts/fixtures/import-analysis-diagnostic.jpg';

export function synthesizeArtwork() {
  const bytes = readFileSync(path.join(repoRoot, ARTWORK_PATH));
  return { base64: bytes.toString('base64'), mediaType: 'image/jpeg', ...ARTWORK };
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
    // What the route reads from its environment, so a mismatch with production is visible.
    promptVersion: profile.promptVersion,
    maxTokens: profile.outputTokens,
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
