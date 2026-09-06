// gate: build
// guards: api/**, src/ai/**

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  buildApiRuntime,
  isolatedTestEnvironment,
  projectRoot,
} from './api-runtime-build.mjs';

const runtime = await buildApiRuntime([
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
  'api/_lib/feedbackStore.test.ts',
  'api/_lib/entitlements.test.ts',
  'api/_lib/adminAuth.test.ts',
  'api/_lib/templateVisibility.test.ts',
  'api/_lib/admin/periods.test.ts',
  'api/_lib/admin/eligibility.test.ts',
  'api/_lib/admin/usage.test.ts',
  'api/_lib/me/agentKeys.test.ts',
  'api/_lib/me/graphics.test.ts',
]);

try {
  const testFiles = [
    path.join(runtime.outputDir, 'api/_lib/aiGateway.test.js'),
    path.join(runtime.outputDir, 'api/_lib/aiGenerate.test.js'),
    path.join(runtime.outputDir, 'api/_lib/aiModelDiscovery.test.js'),
    path.join(runtime.outputDir, 'api/_lib/aiTaskRegistry.test.js'),
    path.join(runtime.outputDir, 'api/_lib/aiBenchPreflight.test.js'),
    path.join(runtime.outputDir, 'api/_lib/aiLite.test.js'),
    path.join(runtime.outputDir, 'api/_lib/aiLiteCapacity.test.js'),
    path.join(runtime.outputDir, 'api/_lib/proCostCeiling.test.js'),
    path.join(runtime.outputDir, 'api/_lib/pro/managedCall.test.js'),
    path.join(runtime.outputDir, 'api/_lib/pro/reservationAccounting.test.js'),
    path.join(runtime.outputDir, 'api/_lib/funnelEvents.test.js'),
    path.join(runtime.outputDir, 'api/_lib/dataIngest.test.js'),
    path.join(runtime.outputDir, 'api/_lib/rateLimit.test.js'),
    path.join(runtime.outputDir, 'api/_lib/feedbackStore.test.js'),
    path.join(runtime.outputDir, 'api/_lib/entitlements.test.js'),
    path.join(runtime.outputDir, 'api/_lib/adminAuth.test.js'),
    path.join(runtime.outputDir, 'api/_lib/templateVisibility.test.js'),
    path.join(runtime.outputDir, 'api/_lib/admin/periods.test.js'),
    path.join(runtime.outputDir, 'api/_lib/admin/eligibility.test.js'),
    path.join(runtime.outputDir, 'api/_lib/admin/usage.test.js'),
    path.join(runtime.outputDir, 'api/_lib/me/agentKeys.test.js'),
    path.join(runtime.outputDir, 'api/_lib/me/graphics.test.js'),
  ];
  const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: projectRoot,
    env: isolatedTestEnvironment(),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  await runtime.cleanup();
}
