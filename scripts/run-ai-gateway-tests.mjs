// gate: build
// guards: api/**, src/ai/**

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  buildApiRuntime,
  isolatedTestEnvironment,
  projectRoot,
} from './api-runtime-build.mjs';
import { measured } from './measured.mjs';

/** The sources compiled below, and the one list the count is taken from. */
const sources = [
  'api/_lib/aiGateway.test.ts',
  'api/_lib/aiGenerate.test.ts',
  'api/_lib/aiModelDiscovery.test.ts',
  'api/_lib/aiTaskRegistry.test.ts',
  'api/_lib/aiBenchPreflight.test.ts',
  'api/_lib/aiLite.test.ts',
  'api/_lib/aiLiteCapacity.test.ts',
  'api/_lib/proCostCeiling.test.ts',
  'api/_lib/pro/managedCall.test.ts',
  'api/_lib/pro/reservationAccounting.test.ts',
  'api/_lib/funnelEvents.test.ts',
  'api/_lib/dataIngest.test.ts',
  'api/_lib/rateLimit.test.ts',
  'api/_lib/statusProbe.test.ts',
  'api/_lib/outputAudio.test.ts',
  'api/_lib/feedbackStore.test.ts',
  'api/_lib/entitlements.test.ts',
  'api/_lib/adminAuth.test.ts',
  'api/_lib/templateVisibility.test.ts',
  'api/_lib/admin/periods.test.ts',
  'api/_lib/admin/eligibility.test.ts',
  'api/_lib/admin/usage.test.ts',
  'api/_lib/me/agentKeys.test.ts',
  'api/_lib/me/graphics.test.ts',
  'api/_lib/me/packages.test.ts',
  'api/_lib/me/communityPacks.test.ts',
  'api/_lib/me/mcp.test.ts',
  'api/_lib/me/connectors.test.ts',
  'api/_lib/me/connectorTools.test.ts',
  'api/_lib/me/connectorSend.test.ts',
  'api/_lib/harness/client.test.ts',
];

// The suite this runner is. `node --test` with an empty file list runs nothing and exits 0, so a
// list that stopped resolving would report a passing AI-gateway suite having run no test at all.
measured(sources.length, 'ai gateway test files');

const runtime = await buildApiRuntime(sources);

try {
  const testFiles = sources.map((source) => path.join(runtime.outputDir, source.replace(/\.ts$/, '.js')));
  const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: projectRoot,
    env: isolatedTestEnvironment(),
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  await runtime.cleanup();
}
