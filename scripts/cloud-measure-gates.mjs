// Replay a recent PR's changed paths through the canonical gate selector on this revision.
// Run inside cloud-measure.mjs with an explicit time bound; this changes no verification rule.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { audit, guardsHit, guardsOf, runTests } from './gates.mjs';

const { files } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (!Array.isArray(files) || !files.length || files.some((file) => typeof file !== 'string')) {
  throw new Error('Expected a nonempty files array containing the PR changed paths');
}
const inventory = audit();
if (inventory.problems.length) throw new Error(inventory.problems.join('\n'));
const reached = (gate) => gate.header.gate === 'build' && guardsHit(guardsOf(gate), files);
const checks = inventory.checks.filter(reached);
const tests = inventory.tests.filter(reached).map((gate) => gate.entry);
console.log(JSON.stringify({ changedPaths: files.length, checks: checks.map((gate) => gate.name), tests }));
for (const gate of checks) {
  const run = spawnSync('npm', ['run', gate.name], { stdio: 'inherit', windowsHide: true });
  if (run.error) throw run.error;
  if (run.status !== 0) process.exit(run.status ?? 1);
}
if (tests.length) process.exitCode = runTests(tests, 'build');
