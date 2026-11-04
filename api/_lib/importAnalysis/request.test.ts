// The import-analysis request as the provider receives it (#2022). Gemini refused every analysis
// with HTTP 400: "For schema with enum values, schema type should be STRING" - the output schema
// carried a numeric enum (animation.speed). These tests send the route's own request through the
// real gateway adapter to a stubbed provider: no network, no key, no paid call.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { executeGatewayRequest, GatewayError } from '../aiGateway.js';
import { importAnalysisPolicy, importAnalysisProfile } from '../aiImportAnalysisProfile.js';
import { importAnalysisModelRequest } from './request.js';
import {
  IMPORT_ANALYSIS_GRAPHIC_TYPES,
  IMPORT_ANALYSIS_OUTPUT,
  IMPORT_ANALYSIS_SPEEDS,
  importAnalysisFromWire,
} from '../../../src/ai/importAnalysis/contract.js';

const JPEG = `/9j/${'A'.repeat(80)}`;
const saved = process.env.AI_IMPORT_ANALYSIS_GATEWAY_PROVIDERS;
beforeEach(() => { process.env.AI_IMPORT_ANALYSIS_GATEWAY_PROVIDERS = 'google,vertex'; });
afterEach(() => {
  if (saved === undefined) delete process.env.AI_IMPORT_ANALYSIS_GATEWAY_PROVIDERS;
  else process.env.AI_IMPORT_ANALYSIS_GATEWAY_PROVIDERS = saved;
});

/** Every schema node holding an `enum`, with its path. */
function enumNodes(node: unknown, path = '$', out: { path: string; node: Record<string, unknown> }[] = []) {
  if (Array.isArray(node)) node.forEach((child, i) => enumNodes(child, `${path}[${i}]`, out));
  else if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if ('enum' in record) out.push({ path, node: record });
    for (const [key, child] of Object.entries(record)) if (key !== 'enum') enumNodes(child, `${path}.${key}`, out);
  }
  return out;
}

/** The route's request, sent through the real Vercel adapter to a provider that records the body
 *  and answers `answer`. */
async function send(answer: unknown) {
  const profile = importAnalysisProfile();
  const policy = importAnalysisPolicy(profile);
  assert.ok(policy, 'the production policy is built');
  const bodies: Record<string, unknown>[] = [];
  const result = await executeGatewayRequest(
    {
      request: importAnalysisModelRequest({ image: { base64: JPEG, mediaType: 'image/jpeg', width: 480, height: 270 } }, profile),
      route: profile.route,
    },
    {
      keyFor: async () => 'test-key',
      sleep: async () => {},
      fetchImpl: (async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return Response.json({
          choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 10 },
        });
      }) as unknown as typeof fetch,
    },
    { maxAttempts: 1, retryLimit: 0, gateway: policy },
  );
  return { result, body: bodies[0] };
}

const answer = (speed?: string) => ({
  version: 1,
  graphicType: IMPORT_ANALYSIS_GRAPHIC_TYPES[0],
  graphicTypeConfidence: 0.9,
  canvas: { aspect: 1.78 },
  regions: [],
  warnings: [],
  animation: { presetId: 'design-slide', direction: 'both', ...(speed === undefined ? {} : { speed }) },
});

test('the schema the route sends has no enum that is not a string (#2022)', async () => {
  const { body } = await send(answer('1'));
  const responseFormat = body.response_format as { json_schema: { schema: unknown } };
  const nodes = enumNodes(responseFormat.json_schema.schema);
  assert.ok(nodes.length >= 8, `the walk reached the enums (${nodes.length})`);
  for (const { path, node } of nodes) {
    assert.equal(node.type, 'string', `${path} must be type string`);
    for (const value of node.enum as unknown[]) assert.equal(typeof value, 'string', `${path} holds ${JSON.stringify(value)}`);
  }
  // The rest of the request is unchanged: the image part, and the privacy policy.
  const messages = body.messages as { content: unknown }[];
  assert.deepEqual((messages[1].content as unknown[])[1], { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${JPEG}` } });
  assert.deepEqual(body.providerOptions, {
    gateway: { zeroDataRetention: true, disallowPromptTraining: true, only: ['google', 'vertex'], sort: 'cost', tags: ['surface:import-analysis'] },
  });
});

test('the contract schema itself has no non-string enum', () => {
  for (const { path, node } of enumNodes(IMPORT_ANALYSIS_OUTPUT.schema)) {
    assert.equal(node.type, 'string', path);
    assert.ok((node.enum as unknown[]).every((value) => typeof value === 'string'), path);
  }
});

test('round trip: every speed the model may answer comes back as the number the route returns', async () => {
  for (const speed of IMPORT_ANALYSIS_SPEEDS) {
    const { result } = await send(answer(String(speed)));
    const analysis = importAnalysisFromWire(result.output);
    assert.equal(analysis.animation?.speed, speed);
    assert.equal(typeof analysis.animation?.speed, 'number');
    assert.equal(analysis.animation?.presetId, 'design-slide');
  }
  // No speed, or no animation at all, passes through untouched.
  const { result } = await send(answer());
  assert.deepEqual(importAnalysisFromWire(result.output).animation, { presetId: 'design-slide', direction: 'both' });
  const { animation: _none, ...still } = answer();
  assert.deepEqual(importAnalysisFromWire(still), still);
});

test('a speed outside the enum is refused by the gateway, never passed on', async () => {
  await assert.rejects(send(answer('2')), (error: unknown) => error instanceof GatewayError && error.code === 'malformed_response');
  await assert.rejects(send({ ...answer(), animation: { presetId: 'design-slide', direction: 'both', speed: 1.5 } }), GatewayError);
});

test('the route decodes the answer before returning it', () => {
  const route = readFileSync(path.join(process.cwd(), 'api/_lib/importAnalysis/analyze.ts'), 'utf8');
  assert.match(route, /const analysis = importAnalysisFromWire\(result\.output\);/);
});
