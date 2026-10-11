// Run identity for every benchmark run. Results are only comparable when the whole
// manifest matches; a report that mixes manifests must say so. The catalog is unfrozen
// (variants land weekly), which is why the catalog hash is PART of run identity - see
// docs/AI_LITE_BENCHMARK.md ("two comparison modes").

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LITE_BENCH_SUITE_ID } from './suites.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function filesUnder(dir) {
  const absolute = path.join(projectRoot, dir);
  const out = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(relative));
    else if (/\.(ts|tsx|mjs|json|css)$/.test(entry.name)) out.push(relative);
  }
  return out.sort();
}

function hashPaths(paths) {
  const hash = createHash('sha256');
  for (const relative of paths) {
    hash.update(relative.replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(readFileSync(path.join(projectRoot, relative)));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8', windowsHide: true }).trim();
  } catch {
    return 'unknown';
  }
}

function playwrightVersion() {
  try {
    const require = createRequire(path.join(projectRoot, 'package.json'));
    return require('@playwright/test/package.json').version;
  } catch {
    return 'unknown';
  }
}

/**
 * Build the manifest for one run. `mode` states which comparison the run supports:
 * 'model-comparison' (pipeline fixed, model varies) or 'regression' (model fixed or
 * absent, pipeline varies). `candidate` describes the model route when one is involved -
 * calibration and floor runs pass null.
 */
export function buildRunManifest({ mode, candidate = null, extra = {} }) {
  const timestamp = new Date().toISOString();
  return {
    manifestVersion: 1,
    suiteId: LITE_BENCH_SUITE_ID,
    mode,
    runId: `${LITE_BENCH_SUITE_ID}-${timestamp.replaceAll(/[:.]/g, '-')}`,
    gitCommit: gitCommit(),
    hashes: {
      // The Lite prompt contract: system prompt text, catalog digest, schema, semantics.
      liteContract: hashPaths(['src/ai/lite/contract.ts']),
      // The shared deterministic compile pipeline.
      pipeline: hashPaths([
        'src/ai/lite/pipeline.ts',
        'src/ai/designSpec.ts',
        'src/ai/designAdjust.ts',
        'src/ai/spec/specDesign.ts',
        'src/ai/spec/specValidate.ts',
      ]),
      // Everything the assemblers can emit - the catalog in the widest sense.
      catalog: hashPaths(filesUnder('src/templates')),
      validators: hashPaths(filesUnder('src/validation')),
      suite: hashPaths(['scripts/ai-lite-bench/suites.mjs']),
    },
    environment: {
      node: process.version,
      playwright: playwrightVersion(),
      os: `${os.platform()} ${os.release()}`,
      arch: os.arch(),
    },
    candidate,
    timestamp,
    ...extra,
  };
}

/** True when two manifests support a MODEL comparison (identical pipeline identity). */
export function pipelineIdentityMatches(a, b) {
  return ['liteContract', 'pipeline', 'catalog', 'validators', 'suite']
    .every((key) => a.hashes?.[key] === b.hashes?.[key])
    && a.suiteId === b.suiteId;
}
