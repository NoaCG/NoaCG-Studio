// Shared driver for the FREE benchmark preflight (api/_lib/aiBenchPreflight.ts), used by
// `npm run bench:preflight` (the CLI) and by the paid runners that gate themselves on it
// (ai-vision-run.mjs). SPENDS NOTHING and reaches no network: it compiles the real server
// preflight code and resolves the arms through it, exactly as the API tests compile it.
//
// One function because the driver is subtle in two ways that must not fork: the entry is
// imported via a file:// URL (a bare Windows path reads as an unsupported URL scheme), and
// the ambient environment is passed as DATA rather than inherited, so the report describes
// .env rather than whatever the calling shell happens to carry.

import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildApiRuntime, projectRoot } from './api-runtime-build.mjs';

/**
 * Run the preflight for one task over a set of candidates.
 *
 * @param {object} plan
 * @param {'lite' | 'import-analysis'} plan.task which task profile resolves the arms
 * @param {string[]} plan.candidates model ids the run claims to measure
 * @param {Record<string, string>} plan.ambient the environment the dev server would inherit
 * @param {boolean} [plan.requireEvalIdentity] check the bench token credentials too
 * @param {boolean} [plan.includeIncumbent] add the profile-default baseline arm when absent
 * @param {Record<string, Record<string, string>>} [plan.armEnvExtra] per-candidate extra env,
 *   for a runner that injects more than the route (the vision runner's resolved allowlist) -
 *   the preflight must mirror the run's injection exactly or it certifies a different run
 * @returns {Promise<{ok: boolean, incumbent: string, arms: object[], findings: object[]}>}
 */
export async function runTaskPreflight(plan) {
  const runtime = await buildApiRuntime(['api/_lib/aiBenchPreflight.ts']);
  try {
    const entry = path.join(runtime.outputDir, 'api/_lib/aiBenchPreflight.js');
    const driver = path.join(runtime.outputDir, 'preflight-driver.mjs');
    await writeFile(
      driver,
      'import { benchPreflight, benchCredentialFindings, defaultIncumbentModel, defaultImportAnalysisModel, '
        + 'litePreflightTask, importAnalysisPreflightTask } from '
        + `${JSON.stringify(pathToFileURL(entry).href)};\n`
        + 'const plan = JSON.parse(process.argv[2]);\n'
        + "const lite = plan.task !== 'import-analysis';\n"
        + 'const taskDef = lite ? litePreflightTask : importAnalysisPreflightTask;\n'
        // The incumbent is DERIVED from the profile default, so it cannot name a
        // superseded model - a comparison with nothing to beat is not a comparison.
        + 'const incumbent = lite ? defaultIncumbentModel() : defaultImportAnalysisModel();\n'
        + 'const candidates = plan.includeIncumbent && !plan.candidates.includes(incumbent)\n'
        + '  ? [...plan.candidates, incumbent] : plan.candidates;\n'
        // Each arm's env is EXACTLY what its runner injects - the injection contract is the
        // thing under test, so the two must never drift.
        + 'const arms = candidates.map((candidate) => ({ candidate, env: lite\n'
        + "  ? { AI_LITE_PRIMARY_MODEL: candidate, AI_LITE_PRIMARY_PROVIDER: 'vercel' }\n"
        + "  : { AI_TASK_IMPORT_ANALYSIS_ENABLED: '1', AI_IMPORT_ANALYSIS_PROVIDER: 'vercel',\n"
        + '      AI_IMPORT_ANALYSIS_MODEL: candidate, ...(plan.armEnvExtra?.[candidate] ?? {}) } }));\n'
        + 'const report = benchPreflight(arms, plan.ambient, taskDef);\n'
        + 'report.findings.push(...benchCredentialFindings(plan.ambient, '
        + '{ requireEvalIdentity: plan.requireEvalIdentity, enabledFlag: lite ? undefined : null }));\n'
        + "report.ok = !report.findings.some((f) => f.severity === 'error');\n"
        + 'report.incumbent = incumbent;\n'
        + 'process.stdout.write(JSON.stringify(report));\n',
      'utf8',
    );
    const result = spawnSync(process.execPath, [driver, JSON.stringify(plan)], {
      cwd: projectRoot,
      encoding: 'utf8',
      // The real environment is passed as DATA (plan.ambient), not inherited, so the
      // preflight reports on .env rather than on whatever this shell happens to carry.
      env: { PATH: process.env.PATH, NODE_ENV: 'test' },
      windowsHide: true,
    });
    if (result.status !== 0) {
      throw new Error(result.stderr || 'The preflight failed to run.');
    }
    return JSON.parse(result.stdout);
  } finally {
    await runtime.cleanup();
  }
}

/** Render a preflight report to the console the same way in every runner. Returns ok. */
export function printPreflightReport(report) {
  const width = Math.max(20, ...report.arms.flatMap((a) => [a.candidate.length, a.resolved.model.length]));
  console.log(`Preflight: ${report.arms.length} arm(s)\n`);
  console.log(`  ${'arm (reported)'.padEnd(width)} -> ${'would actually serve'.padEnd(width)}  configured`);
  for (const arm of report.arms) {
    const mark = arm.resolved.model === arm.candidate && arm.configured ? ' ' : '✗';
    console.log(
      `${mark} ${arm.candidate.padEnd(width)} -> ${arm.resolved.model.padEnd(width)}  ${arm.configured ? 'yes' : 'NO '}`
        + (arm.candidate === report.incumbent ? '  [incumbent baseline]' : ''),
    );
  }
  const errors = report.findings.filter((f) => f.severity === 'error');
  const warnings = report.findings.filter((f) => f.severity === 'warning');
  if (errors.length) {
    console.log(`\n${errors.length} blocking problem(s):\n`);
    for (const f of errors) console.log(`  ✗ [${f.code}] ${f.arm ? `${f.arm}: ` : ''}${f.message}\n`);
  }
  if (warnings.length) {
    console.log(`${warnings.length} warning(s):\n`);
    for (const f of warnings) console.log(`  ! [${f.code}] ${f.message}\n`);
  }
  return report.ok;
}
