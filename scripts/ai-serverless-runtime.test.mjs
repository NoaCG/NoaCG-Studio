// guards: api/**

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  buildApiRuntime,
  isolatedTestEnvironment,
  projectRoot,
} from './api-runtime-build.mjs';

// The handler MODULES, which now live under api/_lib/ so they cost nothing against the
// deployment's 12-function cap, plus the three ROUTED dispatchers that actually ship. Both
// halves matter: the handlers carry the behaviour these assertions check, and the dispatchers
// are the artifacts Vercel deploys - if one of those failed to load, every route behind it
// would be dead however healthy its handler was.
const ENTRYPOINTS = [
  'api/_lib/aiRoutes/config.ts',
  'api/_lib/aiRoutes/credentials.ts',
  'api/ai/generate.ts',
  'api/_lib/aiRoutes/models.ts',
  'api/_lib/lite/status.ts',
  'api/_lib/lite/generations.ts',
  'api/_lib/lite/outcome.ts',
  'api/_lib/lite/judge.ts',
  'api/ai/[...path].ts',
  'api/ai/lite/[...path].ts',
  'api/ai/tasks/[...path].ts',
];

async function artifactFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? artifactFiles(filePath) : [filePath];
  }));
  return nested.flat();
}

const smokeSource = String.raw`
  import assert from 'node:assert/strict';

  const [configUrl, credentialsUrl, generateUrl, modelsUrl, liteStatusUrl, liteGenerationsUrl, liteOutcomeUrl, liteJudgeUrl] = process.argv.slice(1);
  const [
    { default: configHandler },
    { default: credentialsHandler },
    { default: generateHandler },
    { default: modelsHandler },
    { default: liteStatusHandler },
    { default: liteGenerationsHandler },
    { default: liteOutcomeHandler },
    { default: liteJudgeHandler },
  ] = await Promise.all([
    import(configUrl),
    import(credentialsUrl),
    import(generateUrl),
    import(modelsUrl),
    import(liteStatusUrl),
    import(liteGenerationsUrl),
    import(liteOutcomeUrl),
    import(liteJudgeUrl),
  ]);

  const configResponse = await configHandler.fetch(
    new Request('https://noacg.test/api/ai/config'),
  );
  assert.equal(configResponse.status, 200);
  const config = await configResponse.json();
  assert.deepEqual(Object.keys(config).sort(), ['keyStorageAvailable', 'providers']);
  assert.equal(config.keyStorageAvailable, true);
  assert.deepEqual(
    config.providers.map((provider) => ({
      id: provider.id,
      userKey: provider.userKey,
      managedKey: provider.managedKey,
      available: provider.available,
      requiresSignIn: provider.requiresSignIn,
    })),
    ['anthropic', 'openai', 'google', 'vercel', 'huggingface'].map((id) => ({
      id,
      userKey: false,
      managedKey: true,
      available: true,
      requiresSignIn: false,
    })),
  );
  assert.equal(JSON.stringify(config).includes('provider-key-placeholder'), false);

  const credentialsResponse = await credentialsHandler.fetch(
    new Request('https://noacg.test/api/ai/credentials', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        origin: 'https://noacg.test',
      },
      body: JSON.stringify({
        provider: 'vercel',
        key: 'user-key-placeholder',
      }),
    }),
  );
  assert.equal(credentialsResponse.status, 200);
  assert.deepEqual(await credentialsResponse.json(), {
    ok: true,
    provider: 'vercel',
    configured: true,
  });

  const generateResponse = await generateHandler.fetch(
    new Request('https://noacg.test/api/ai/generate'),
  );
  assert.equal(generateResponse.status, 405);
  assert.equal(
    (await modelsHandler.fetch(new Request('https://noacg.test/api/ai/models?provider=invalid'))).status,
    400,
  );

  const liteStatusResponse = await liteStatusHandler.fetch(
    new Request('https://noacg.test/api/ai/lite/status'),
  );
  assert.equal(liteStatusResponse.status, 200);
  const liteStatus = await liteStatusResponse.json();
  assert.equal(liteStatus.profile, 'lite');
  assert.equal(liteStatus.enabled, false);
  assert.equal(liteStatus.available, false);
  assert.equal(JSON.stringify(liteStatus).includes('gemini'), false);
  assert.equal(JSON.stringify(liteStatus).includes('qwen'), false);

  process.env.AI_LITE_ENABLED = 'true';
  process.env.AI_LITE_GATEWAY_PROVIDERS = 'audited/provider';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'public-anon-placeholder';
  const incompleteLiteStatusResponse = await liteStatusHandler.fetch(
    new Request('https://noacg.test/api/ai/lite/status'),
  );
  const incompleteLiteStatus = await incompleteLiteStatusResponse.json();
  assert.equal(incompleteLiteStatus.enabled, true);
  assert.equal(incompleteLiteStatus.available, false);
  assert.equal(incompleteLiteStatus.reason, 'not-configured');

  assert.equal(
    (await liteGenerationsHandler.fetch(new Request('https://noacg.test/api/ai/lite/generations'))).status,
    405,
  );
  assert.equal(
    (await liteOutcomeHandler.fetch(new Request('https://noacg.test/api/ai/lite/outcome'))).status,
    405,
  );
  assert.equal(
    (await liteJudgeHandler.fetch(new Request('https://noacg.test/api/ai/lite/judge'))).status,
    405,
  );
  // The judge fails closed: enabled Lite alone does not enable it.
  const judgeDisabled = await liteJudgeHandler.fetch(
    new Request('https://noacg.test/api/ai/lite/judge', { method: 'POST', body: '{}' }),
  );
  assert.equal(judgeDisabled.status, 503);
  assert.equal((await judgeDisabled.json()).error.code, 'profile_not_configured');

  // The three dispatchers Vercel actually deploys. Each must LOAD - which transitively loads
  // every handler behind it, so a broken import anywhere in the group fails here - and must
  // refuse an unknown path rather than throwing.
  const [aiDispatchUrl, liteDispatchUrl, tasksDispatchUrl] = process.argv.slice(9);
  for (const [url, prefix] of [
    [aiDispatchUrl, '/api/ai'],
    [liteDispatchUrl, '/api/ai/lite'],
    [tasksDispatchUrl, '/api/ai/tasks'],
  ]) {
    const { default: dispatcher } = await import(url);
    const missing = await dispatcher.fetch(new Request('https://noacg.test' + prefix + '/definitely-not-a-route'));
    assert.equal(missing.status, 404, prefix + ' dispatcher must 404 an unknown path');
  }
`;

test('Vercel-style JavaScript artifacts load and execute every Creative AI function', async (t) => {
  const runtime = await buildApiRuntime(ENTRYPOINTS);
  t.after(() => runtime.cleanup());

  const files = await artifactFiles(runtime.outputDir);
  assert.equal(
    files.some((filePath) => /\.(?:cts|mts|tsx?)$/i.test(filePath)),
    false,
    'the serverless artifact must not depend on TypeScript source files',
  );

  for (const filePath of files.filter((candidate) => /\.(?:c|m)?js$/i.test(candidate))) {
    const source = await readFile(filePath, 'utf8');
    assert.doesNotMatch(
      source,
      /(?:from\s+|import\s*\()['"][^'"]+\.tsx?['"]/,
      `emitted module specifier still points at TypeScript: ${path.relative(projectRoot, filePath)}`,
    );
  }

  const entryUrls = ENTRYPOINTS.map((entrypoint) => pathToFileURL(
    path.join(runtime.outputDir, entrypoint.replace(/\.ts$/, '.js')),
  ).href);
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', smokeSource, ...entryUrls],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: isolatedTestEnvironment({
        AI_KEY_ENCRYPTION_SECRET: 'test-encryption-secret-with-at-least-32-characters',
        ANTHROPIC_API_KEY: 'provider-key-placeholder-anthropic',
        OPENAI_API_KEY: 'provider-key-placeholder-openai',
        GOOGLE_API_KEY: 'provider-key-placeholder-google',
        AI_GATEWAY_API_KEY: 'provider-key-placeholder-gateway',
        HF_TOKEN: 'provider-key-placeholder-huggingface',
      }),
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
