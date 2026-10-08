// gate: build
// guards: AGENTS.md, **/AGENTS.md, **/CLAUDE.md, .agent-workflows/**, .agents/**, .claude/commands/**, .claude/skills/**, .claude/agents/**, .codex/config.toml, contracts/**, package.json, docs/AGENT_WORKFLOWS.md
// Exercise the real top-level gate in a staged temporary repository, without importing it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE = 'scripts/check-shared-instructions.mjs';

test('shared-instructions gate accepts the repository and refuses instruction drift', { timeout: 120_000 }, async (t) => {
  const started = performance.now();
  const deadline = started + 110_000;
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'shared-instructions-test-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));

  // Child processes must stay in the fixture even when invoked from a Git hook or gate runner.
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_') || key === 'GATE_MEASURED_FILE') delete env[key];
  }
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';

  function run(command, args, cwd = fixture) {
    const remaining = Math.floor(deadline - performance.now());
    assert.ok(remaining > 0, 'fixture suite must finish in under two minutes');
    const result = spawnSync(command, args, {
      cwd, env, encoding: 'utf8', timeout: remaining, maxBuffer: 4 * 1024 * 1024,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, `${command} was terminated: ${result.stderr}`);
    return { status: result.status, stdout: result.stdout, output: result.stdout + result.stderr };
  }

  function git(args, cwd = fixture) {
    const result = run('git', args, cwd);
    assert.equal(result.status, 0, result.output);
    return result.output;
  }

  const copied = new Set();
  function copy(relative) {
    if (copied.has(relative)) return;
    const destination = path.join(fixture, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(ROOT, relative), destination);
    copied.add(relative);
  }

  // Copy only instruction inputs, not the application, node_modules or other worktrees.
  // Use Git's file list so hidden adapters are included and ignored machine state is excluded.
  const listed = run('git', ['-c', `safe.directory=${ROOT.replaceAll('\\', '/')}`,
    'ls-files', '--cached', '--others', '--exclude-standard', '-z'], ROOT);
  assert.equal(listed.status, 0, listed.output);
  const repoFiles = listed.stdout.split('\0').filter(Boolean);
  for (const file of repoFiles) {
    if (/(^|\/)(AGENTS|CLAUDE)\.md$/.test(file)
      || /^(?:\.agent-workflows|\.claude\/(?:commands|skills|agents)|\.agents\/skills|contracts)\//.test(file)
      || ['.codex/config.toml', 'package.json', 'docs/AGENT_WORKFLOWS.md'].includes(file)) {
      copy(file);
    }
  }

  function copyModule(relative) {
    if (copied.has(relative)) return;
    copy(relative);
    const source = readFileSync(path.join(ROOT, relative), 'utf8');
    for (const match of source.matchAll(/^\s*(?:import|export)\s+(?:[^;'"]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm)) {
      const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1]));
      assert.ok(dependency.startsWith('scripts/'), `unexpected gate dependency: ${dependency}`);
      copyModule(dependency);
    }
  }
  copyModule(GATE);

  // The gate checks existence (not execution) of these backtick-delimited script references.
  for (const workflow of copied) {
    if (!/^\.agent-workflows\/[^/]+\.md$/.test(workflow)) continue;
    const content = readFileSync(path.join(ROOT, workflow), 'utf8');
    for (const match of content.matchAll(/`(scripts\/[A-Za-z0-9._/-]+)/g)) copy(match[1]);
  }
  git(['init', '--quiet']);
  git(['-c', 'core.autocrlf=false', 'add', '-A']);

  function checkClean() {
    const result = run(process.execPath, [path.join(fixture, GATE)]);
    assert.equal(result.status, 0, `unmutated fixture must pass:\n${result.output}`);
    assert.ok(result.output.includes('Shared instructions OK:'), result.output);
  }

  // Each refusal has its own clean control and restores its exact bytes, even on assertion failure.
  async function refuses(name, relative, mutate, messages) {
    await t.test(name, () => {
      checkClean();
      const file = path.join(fixture, relative);
      const original = readFileSync(file);
      let undo;
      try {
        undo = mutate(file, original.toString('utf8'));
        const result = run(process.execPath, [path.join(fixture, GATE)]);
        assert.equal(result.status, 1, result.output);
        for (const message of messages) assert.ok(result.output.includes(message), result.output);
      } finally {
        if (undo) undo();
        writeFileSync(file, original);
      }
    });
  }

  await t.test('clean repository exits zero', checkClean);

  const gateSource = readFileSync(path.join(fixture, GATE), 'utf8');
  const reserveMatch = gateSource.match(/^const CHAIN_MIN_FREE_BYTES = (\d+);/m);
  assert.ok(reserveMatch, 'gate must declare CHAIN_MIN_FREE_BYTES');
  const reserve = Number(reserveMatch[1]);
  const config = readFileSync(path.join(fixture, '.codex/config.toml'), 'utf8');
  const limitMatch = config.match(/^\s*project_doc_max_bytes\s*=\s*(\d+)\s*$/m);
  assert.ok(limitMatch, 'fixture must declare its instruction budget');
  const limit = Number(limitMatch[1]);
  const leaf = 'src/components/wizard/AGENTS.md';
  const chain = [...copied].filter((file) => path.posix.basename(file) === 'AGENTS.md'
    && (path.posix.dirname(file) === '.' || leaf.startsWith(path.posix.dirname(file) + '/')));
  const bytes = chain.reduce((sum, file) => sum + Buffer.byteLength(
    readFileSync(path.join(fixture, file), 'utf8').replace(/\r\n/g, '\n'), 'utf8',
  ), 0) + (chain.length - 1) * 2;
  const growth = limit - (reserve - 1) - bytes;
  assert.ok(growth > 0, 'clean chain must have room for the mutation');
  await refuses('Codex chain with one byte less than the required headroom', leaf,
    (file, content) => { writeFileSync(file, content + 'x'.repeat(growth)); },
    [`Codex instruction chain ending at ${leaf} has ${reserve - 1} bytes free`, `inside the ${reserve}-byte reserve`]);

  await refuses('orchestrator exceeds its workflow line limit', '.agent-workflows/orchestrator.md',
    (file, content) => { writeFileSync(file, content + '\nExtra workflow instruction.'.repeat(171)); },
    ['.agent-workflows/orchestrator.md is ', 'over its limit of 170']);

  await refuses('Claude command exceeds the thin wrapper line limit', '.claude/commands/next.md',
    (file, content) => { writeFileSync(file, content + '\nExtra adapter instruction.'.repeat(26)); },
    ['Claude command adapter: .claude/commands/next.md is ', 'canonical instructions belong in .agent-workflows/next.md']);

  await refuses('Claude command loses its canonical workflow pointer', '.claude/commands/next.md',
    (file, content) => {
      assert.ok(content.includes('.agent-workflows/next.md'));
      writeFileSync(file, content.replaceAll('.agent-workflows/next.md', 'missing-pointer.md'));
    }, ['Claude command adapter: .claude/commands/next.md must reference ".agent-workflows/next.md"']);

  await refuses('workflow names an npm script absent from package.json', '.agent-workflows/next.md',
    (file, content) => {
      const missing = 'test:shared-instructions-missing-script';
      const pkg = JSON.parse(readFileSync(path.join(fixture, 'package.json'), 'utf8'));
      assert.ok(!Object.hasOwn(pkg.scripts, missing));
      writeFileSync(file, content + `\nRun \`npm run ${missing}\`.\n`);
    }, ['.agent-workflows/next.md names `npm run test:shared-instructions-missing-script`, which package.json does not define']);

  await refuses('renaming a workflow leaves name-keyed gate declarations stale', '.agent-workflows/orchestrator.md',
    (file) => {
      const renamed = path.join(fixture, '.agent-workflows/renamed-orchestrator.md');
      renameSync(file, renamed);
      return () => renameSync(renamed, file);
    }, [
      'CRITICAL_WORKFLOW_MARKERS has a row for "orchestrator", and .agent-workflows/orchestrator.md does not exist',
      'WORKFLOW_LINE_LIMITS has a row for "orchestrator", and .agent-workflows/orchestrator.md does not exist',
      'alias o: no canonical workflow .agent-workflows/orchestrator.md to alias',
    ]);

  await refuses('workflow has no Codex skill adapter', '.agents/skills/next/SKILL.md',
    (file) => { rmSync(file); },
    ['Codex skill adapter: missing .agents/skills/next/SKILL.md']);

  checkClean();
  t.diagnostic(`Fixture suite completed in ${((performance.now() - started) / 1000).toFixed(2)} s; all mutations restored.`);
});
