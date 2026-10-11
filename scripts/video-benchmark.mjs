// Versioned multi-model video benchmark orchestrator. Each case drives the shipped video
// workflow through scripts/video-bench.mjs, so every model uses the same motion plan, coder,
// validation, repair, preview, render, and export contracts.

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args[0] === 'run' ? 'run' : 'smoke';
const flag = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name) => args.includes(`--${name}`);
const versionDir = path.join(root, 'benchmarks/video/v1');
const config = JSON.parse(await readFile(path.join(versionDir, 'benchmark.json'), 'utf8'));
const briefBank = JSON.parse(await readFile(path.join(versionDir, config.briefsFile), 'utf8'));
const modelBank = JSON.parse(await readFile(path.join(versionDir, config.modelsFile), 'utf8'));
const catalogPath = path.join(root, 'benchmarks/video/model-catalog.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8').catch(() => '{"providers":{}}'));
const runtimeCommit = await commandOutput('git', ['rev-parse', 'HEAD']);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.resolve(
  root,
  flag('out') ?? `video-benchmark-out/${config.benchmarkVersion}-${mode}-${stamp}`,
);
const selectedModelIds = new Set((flag('models') ?? '').split(',').filter(Boolean));
const selectedBriefIds = new Set((flag('briefs') ?? '').split(',').filter(Boolean));
const requestedEngines = (flag('engines') ?? config.engines.join(',')).split(',');
const maxConcurrency = Math.max(
  1,
  Math.min(
    Number(process.env.VIDEO_BENCH_MAX_CONCURRENCY ?? 2),
    Number(flag('concurrency') ?? 1),
  ),
);
const maxCostUsd = Number(flag('max-cost') ?? process.env.VIDEO_BENCH_MAX_COST_USD ?? (mode === 'smoke' ? 1 : 20));
const stub = has('stub');
const render = has('render');

const models = modelBank.models.filter((model) =>
  (mode === 'run' || model.smoke)
  && (selectedModelIds.size === 0 || selectedModelIds.has(model.id)),
);
const briefs = briefBank.briefs.filter((brief) =>
  (mode === 'run' || brief.smoke)
  && (selectedBriefIds.size === 0 || selectedBriefIds.has(brief.id)),
);
const engines = requestedEngines.filter((engine) => config.engines.includes(engine));
if (!models.length || !briefs.length || !engines.length) {
  throw new Error('The selected benchmark matrix is empty.');
}

const catalogModels = [
  ...(catalog.providers?.openrouter?.models ?? []),
  ...(catalog.providers?.huggingface?.models ?? []),
];
const jobs = [];
let reservedCostUsd = 0;
for (const model of models) {
  const metadata = catalogModels.find(
    (item) => item.provider === model.provider && item.id === model.model,
  ) ?? null;
  for (const engine of engines) {
    for (const brief of briefs) {
      const reserve = stub ? 0 : Number(model.estimatedMaxRunCostUsd ?? 0);
      if (reservedCostUsd + reserve > maxCostUsd) continue;
      reservedCostUsd += reserve;
      jobs.push({ model, metadata, engine, brief, reserve });
    }
  }
}
if (!jobs.length) throw new Error(`The $${maxCostUsd.toFixed(2)} spending cap admits no cases.`);

await mkdir(outputDir, { recursive: true });
const manifest = {
  schemaVersion: 1,
  benchmarkVersion: config.benchmarkVersion,
  briefVersion: briefBank.version,
  promptVersion: briefBank.promptVersion,
  modelMatrixVersion: modelBank.version,
  runtimeCommit,
  startedAt: new Date().toISOString(),
  mode,
  settings: config.settings,
  limits: { maxCostUsd, maxConcurrency, reservedCostUsd },
  render,
  stub,
  cases: [],
};
await writeJson(path.join(outputDir, 'manifest.json'), manifest);
console.log(
  `${jobs.length} cases, concurrency ${maxConcurrency}, reserved ceiling $${reservedCostUsd.toFixed(2)} of $${maxCostUsd.toFixed(2)}`,
);

let nextJob = 0;
let startedJobs = 0;
const completed = [];
async function worker() {
  while (nextJob < jobs.length) {
    const job = jobs[nextJob++];
    const id = `${job.model.id}--${job.engine}--${job.brief.id}`;
    const caseDir = path.join(outputDir, id);
    await mkdir(caseDir, { recursive: true });
    const briefFile = path.join(caseDir, 'brief.json');
    await writeJson(briefFile, [job.brief]);
    const childArgs = [
      'scripts/video-bench.mjs',
      caseDir,
      briefFile,
      String(config.settings.runsPerCase),
      `--engine=${job.engine}`,
      `--provider=${job.model.provider}`,
      `--model=${job.model.model}`,
      `--temperature=${config.settings.temperature}`,
      `--seed=${config.settings.seed}`,
      `--benchmark-version=${config.benchmarkVersion}`,
      `--prompt-version=${briefBank.promptVersion}`,
      `--model-revision=${job.metadata?.revision ?? job.metadata?.createdAt ?? 'unknown'}`,
      ...(stub ? ['--stub'] : []),
      ...(render ? ['--render'] : []),
    ];
    console.log(`\n[${++startedJobs}/${jobs.length}] ${id}`);
    const exitCode = await run(process.execPath, childArgs);
    const raw = JSON.parse(await readFile(path.join(caseDir, 'results.json'), 'utf8').catch(() => '[]'));
    const cases = raw.map((result) => ({
      ...result,
      caseId: id,
      briefId: job.brief.id,
      modelClass: job.model.class,
      modelMetadata: job.metadata,
      runtimeCommit,
      exitCode,
      artifactsDir: path.relative(outputDir, caseDir).replaceAll('\\', '/'),
    }));
    completed.push(...cases);
    await writeJson(path.join(outputDir, 'benchmark-results.json'), {
      ...manifest,
      completedAt: new Date().toISOString(),
      cases: completed,
    });
  }
}
await Promise.all(Array.from({ length: maxConcurrency }, () => worker()));

const humanScores = Object.fromEntries(completed.map((item) => [
  item.caseId,
  Object.fromEntries(config.humanScoreFields.map((field) => [field, null])),
]));
await writeJson(path.join(outputDir, 'human-scores.json'), {
  schemaVersion: 1,
  scale: '0-10',
  instructions: 'Review the frame strip and rendered still. Enter one score per field, or leave null.',
  scores: humanScores,
});
console.log(`\nBenchmark artifacts -> ${path.relative(root, outputDir)}`);
console.log(`Run npm run video:bench:report -- --input="${outputDir}" after scoring.`);

async function run(command, commandArgs) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { cwd: root, stdio: 'inherit', windowsHide: true });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function commandOutput(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.on('exit', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(`${command} failed`)));
  });
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
