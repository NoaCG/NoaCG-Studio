// gate: build
// guards: scripts/import-analysis-diagnostic.mjs, scripts/fixtures/import-analysis-diagnostic.jpg, src/ai/importAnalysis/client.ts, .github/workflows/import-analysis-diagnostic.yml, api/_lib/importAnalysis/request.ts, api/_lib/importAnalysis/analyze.ts, api/_lib/aiImportAnalysisProfile.ts, api/_lib/aiGateway.ts, src/ai/importAnalysis/contract.ts
//
// THE ONE #2022 DIAGNOSTIC REQUEST: what it sends, how often, at what worst case, and what it
// keeps. Mocks only: no network, no key. The server modules are compiled from this checkout, as
// the protected workflow runs them.
//
//   node --test scripts/import-analysis-diagnostic.test.mjs
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COST_CAP_USD,
  diagnose,
  errorStrings,
  loadServer,
  sanitizedError,
  synthesizeArtwork,
  worstCaseUsd,
} from './import-analysis-diagnostic.mjs';

const root = (rel) => path.join(path.dirname(fileURLToPath(import.meta.url)), '..', rel);
let server;
const savedProviders = process.env.AI_IMPORT_ANALYSIS_GATEWAY_PROVIDERS;

before(async () => {
  process.env.AI_IMPORT_ANALYSIS_GATEWAY_PROVIDERS = 'google,vertex';
  server = await loadServer();
});
after(async () => {
  if (savedProviders === undefined) delete process.env.AI_IMPORT_ANALYSIS_GATEWAY_PROVIDERS;
  else process.env.AI_IMPORT_ANALYSIS_GATEWAY_PROVIDERS = savedProviders;
  await server?.cleanup();
});

function recorder(respond) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
      return respond(calls.length);
    },
  };
}

const refusal = (status, body) => () => new Response(JSON.stringify(body), { status });

test('synthetic artwork: a baseline JPEG of the stated size, the format the browser sends', () => {
  const art = synthesizeArtwork();
  const jpeg = Buffer.from(art.base64, 'base64');
  assert.equal(art.mediaType, 'image/jpeg');
  // The route's own prefix check for a JPEG body.
  assert.ok(art.base64.startsWith('/9j/'));
  // The baseline frame header (SOF0) carries the height, then the width.
  const sof = jpeg.indexOf(Buffer.from([0xff, 0xc0]));
  assert.ok(sof > 0, 'baseline JPEG');
  assert.equal(jpeg.readUInt16BE(sof + 5), art.height);
  assert.equal(jpeg.readUInt16BE(sof + 7), art.width);
  assert.deepEqual([art.width, art.height], [480, 270]);
  // The browser's client is what fixes the format; if it ever stops sending JPEG, so must this.
  assert.match(readFileSync(root('src/ai/importAnalysis/client.ts'), 'utf8'), /mediaType: 'image\/jpeg'/);
});

test('sends exactly the production request: route, schema, image part and privacy policy', async () => {
  const gateway = recorder(refusal(400, { error: { type: 'AI_APICallError', message: 'mock' } }));
  const record = await diagnose(server, { key: 'test-key', fetchImpl: gateway.fetchImpl });
  assert.equal(gateway.calls.length, 1);
  const [{ url, body }] = gateway.calls;
  assert.equal(url, 'https://ai-gateway.vercel.sh/v1/chat/completions');
  assert.equal(body.model, 'google/gemini-2.5-flash-lite');

  // The route's own builder, so the bytes are the route's.
  const profile = server.profile.importAnalysisProfile();
  const art = synthesizeArtwork();
  const expected = server.request.importAnalysisModelRequest({ image: art, instructions: '' }, profile);
  assert.equal(body.messages[0].content, expected.system);
  assert.deepEqual(body.messages[1].content, [
    { type: 'text', text: JSON.stringify({ canvas: { width: art.width, height: art.height }, instructions: '' }) },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${art.base64}` } },
  ]);
  assert.equal(body.max_tokens, profile.outputTokens);
  assert.deepEqual(body.response_format.json_schema.schema, expected.structuredOutput.schema);
  assert.deepEqual(body.providerOptions.gateway, {
    zeroDataRetention: true,
    disallowPromptTraining: true,
    only: ['google', 'vertex'],
    sort: 'cost',
    tags: ['surface:import-analysis-diagnostic'],
  });
  assert.equal(record.outcome, 'refused');
  assert.equal(record.promptVersion, profile.promptVersion);
  assert.equal(record.maxTokens, profile.outputTokens);
  assert.ok(record.maxUsd > 0 && record.maxUsd <= COST_CAP_USD);
});

test('the route itself sends what the builder builds', () => {
  const route = readFileSync(root('api/_lib/importAnalysis/analyze.ts'), 'utf8');
  assert.match(route, /request: importAnalysisModelRequest\(request, profile\),\n\s+route: profile\.route,/);
});

test('one request only: a retryable refusal is not retried, and a second call never leaves', async () => {
  const gateway = recorder(refusal(503, { error: { type: 'unavailable' } }));
  const record = await diagnose(server, { key: 'test-key', fetchImpl: gateway.fetchImpl });
  assert.equal(gateway.calls.length, 1);
  assert.equal(record.requests, 1);
  assert.equal(record.classified, 'unavailable');
});

test('keeps the sanitized provider error: status, type, code and a redacted message', async () => {
  const echoed = '/9j/4AAQSkZJRg' + 'A'.repeat(200);
  const gateway = recorder(refusal(400, {
    error: {
      type: 'AI_APICallError',
      code: 'invalid_argument',
      message: `Invalid JSON payload: Unknown name "oneOf" at 'generation_config.response_json_schema.properties[2]'; data:image/jpeg;base64,${echoed} key Bearer ${'k'.repeat(48)}`,
      responseBody: `{"error":{"status":"INVALID_ARGUMENT","echo":"${echoed}"}}`,
      detail: { provider: { message: 'response_json_schema: too many states', status: 'INVALID_ARGUMENT' } },
    },
  }));
  const record = await diagnose(server, { key: 'test-key', fetchImpl: gateway.fetchImpl });
  assert.equal(record.provider.status, 400);
  assert.equal(record.provider.type, 'AI_APICallError');
  assert.equal(record.provider.code, 'invalid_argument');
  assert.match(record.provider.message, /Unknown name "oneOf" at 'generation_config\.response_json_schema\.properties\[2\]'/);
  const kept = JSON.stringify(record);
  assert.doesNotMatch(kept, /AAAAAAAAAA|kkkkkkkkkk|test-key/);
  assert.match(record.provider.detail.responseBody, /INVALID_ARGUMENT/);
  // A nested provider reply is kept too, under its dotted path.
  assert.equal(record.provider.detail['detail.provider.message'], 'response_json_schema: too many states');
  assert.equal(record.provider.detail['detail.provider.status'], 'INVALID_ARGUMENT');
});

test('errorStrings stays bounded: four levels and twelve values', () => {
  const deep = { a: { b: { c: { d: 'kept', e: { f: 'too deep' } } } } };
  assert.deepEqual(errorStrings(deep), [['a.b.c.d', 'kept']]);
  const wide = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, 'v']));
  assert.equal(errorStrings(wide).length, 12);
});

test('sanitizedError keeps only short tokens for type and code, and survives a non-JSON body', () => {
  assert.deepEqual(
    { ...sanitizedError(400, JSON.stringify({ error: { type: 'a b c', code: 400 } })), message: null },
    { status: 400, type: null, code: '400', param: null, message: null },
  );
  assert.equal(sanitizedError(400, 'Bad Request').message, 'Bad Request');
});

test('refuses before sending: over the cost cap, without a key, or without the privacy policy', async () => {
  const profile = server.profile.importAnalysisProfile();
  const request = server.request.importAnalysisModelRequest({ image: synthesizeArtwork(), instructions: '' }, profile);
  assert.ok(worstCaseUsd(request, { inputPerMillion: 1_000, outputPerMillion: 1_000 }) > COST_CAP_USD);

  const pricey = { ...server, profile: { ...server.profile, importAnalysisPrice: () => ({ inputPerMillion: 1_000, outputPerMillion: 1_000 }) } };
  const gateway = recorder(refusal(400, {}));
  assert.equal((await diagnose(pricey, { key: 'test-key', fetchImpl: gateway.fetchImpl })).refused, 'cost-cap');
  assert.equal((await diagnose(server, { key: '', fetchImpl: gateway.fetchImpl })).refused, 'no-key');
  const retaining = { ...server, profile: { ...server.profile, importAnalysisPolicy: (p) => ({ ...server.profile.importAnalysisPolicy(p), zeroDataRetention: false }) } };
  assert.match((await diagnose(retaining, { key: 'test-key', fetchImpl: gateway.fetchImpl })).refused, /^privacy/);
  assert.equal(gateway.calls.length, 0);
});

test('workflow: manual, main only, the protected environment, one run ever, the key only to the send step', () => {
  const yml = readFileSync(root('.github/workflows/import-analysis-diagnostic.yml'), 'utf8');
  assert.match(yml, /^on:\n {2}workflow_dispatch:\n\n/m);
  assert.doesNotMatch(yml, /^\s+(push|pull_request|pull_request_target|schedule|workflow_run|inputs):/m);
  assert.match(yml, /if: github\.repository == 'NoaCG\/NoaCG-Studio' && github\.ref == 'refs\/heads\/main'/);
  assert.match(yml, /environment: jev-svg-evaluation\n/);
  assert.match(yml, /concurrency:\n {2}group: jev-svg-evaluation\n {2}cancel-in-progress: false\n/);
  assert.match(yml, /\.github\/workflows\/import-analysis-diagnostic\.yml@refs\/heads\/main/);
  assert.match(yml, /- uses: actions\/checkout@v5\n {8}with:\n {10}persist-credentials: false\n/);
  const keyLines = yml.split('\n').filter((l) => l.includes('secrets.'));
  assert.deepEqual(keyLines.map((l) => l.trim()), ['AI_GATEWAY_API_KEY: ${{ secrets.AI_GATEWAY_API_KEY }}']);
  const send = yml.slice(yml.indexOf('- name: Send the one diagnostic request'), yml.indexOf('- name: Keep the record'));
  assert.match(send, /secrets\.AI_GATEWAY_API_KEY/);
  assert.match(send, /AI_IMPORT_ANALYSIS_GATEWAY_PROVIDERS: google,vertex/);
  // The once-only guard runs before the checkout and names the send step exactly.
  const guard = yml.indexOf('- name: Refuse a second request');
  assert.ok(guard > 0 && guard < yml.indexOf('- uses: actions/checkout@v5'));
  assert.match(yml, /grep -qx 'Send the one diagnostic request'/);
  // A re-run keeps the run id, which the listing skips: only a first attempt may proceed.
  assert.match(yml.slice(guard), /^\s+\[ "\$GITHUB_RUN_ATTEMPT" = "1" \] \|\| \{ echo "FAIL: [^"]+"; exit 1; \}$/m);
});
