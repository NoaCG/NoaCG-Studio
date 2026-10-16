// What counts as showing a .env value (#1281): the reads and dumps an agent session reaches for when
// it looks for credentials are refused, and loading the file for a program, handling the file
// without printing it, and the committed .env files are not. The hooks that use this are tested
// through their real stdin in guard-read.test.mjs, guard-command.test.mjs and
// codex-guard-command.test.mjs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { COMMITTED_ENV_FILES, isSecretEnvFile, readsEnvSecrets, showsEnvSecrets } from './env-secrets.mjs';

/** A folder with nothing in it, so a recursive search here never finds a real .env. */
function emptyDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'noacg-env-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('reading or printing a .env file is refused, in both shells and through a wrapper', (t) => {
  const dir = emptyDir(t);
  for (const command of [
    'cat .env',
    'type .env.local',
    'cat C:/claude/NoaCG-Studio/.env',
    "cat '../NoaCG-Studio/.env'",
    'head -c 30 .env.production',
    'grep SUPABASE .env',
    'grep -n KEY .env*',
    "sed -n '/KEY/p' .env",
    "cut -c1-30 .env | sed 's/=.*//'",
    'Get-Content .env',
    'Get-Content -Path .env.local -TotalCount 5',
    'Select-String -Path .env -Pattern KEY',
    'cmd /c type .env',
    "bash -c 'cat .env'",
    'powershell -NoProfile -Command "& { Get-Content .env }"',
    'cd ../NoaCG-Studio && cat .env',
    'echo "$(cat .env)"',
    'while read line; do echo "${line:0:30}"; done < .env',
    `node -e "console.log(require('fs').readFileSync('.env','utf8').slice(0, 30))"`,
    `python -c "print(open('.env').read())"`,
    '[IO.File]::ReadAllText(".env")',
    'diff .env .env.example',
    'rg -g .env KEY',
    'rg -L KEY .env',
    'powershell -ExecutionPolicy Bypass -Command "Get-Content .env"',
    "bash -euc 'cat .env'",
    'node --env-file=.env -e "console.log(process.env)"',
    "python3 - <<'EOF'\nprint(open('.env').read())\nEOF",
  ]) {
    assert.ok(showsEnvSecrets(command, dir), `${command} was allowed`);
  }
});

test('dumping the environment, or printing a secret-named variable, is refused', (t) => {
  const dir = emptyDir(t);
  for (const command of [
    'printenv',
    'env',
    'env | sort',
    'export -p',
    'set',
    'Get-ChildItem env:',
    'gci env:*',
    '[Environment]::GetEnvironmentVariables()',
    'printenv SUPABASE_ACCESS_TOKEN',
    'echo $SUPABASE_SERVICE_ROLE_KEY',
    'echo "${OPENAI_API_KEY:0:30}"',
    'set -a; . ./.env; set +a; printenv',
    '$env:SUPABASE_ACCESS_TOKEN',
    'Write-Output $env:GITHUB_TOKEN',
    '"$env:SUPABASE_ACCESS_TOKEN"',
    'Get-ChildItem env:SUPABASE*',
    'Get-Item env:SUPABASE_ACCESS_TOKEN',
    "[Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN')",
    'dotenv -e .env -- printenv',
    'echo $DATABASE_URL',
  ]) {
    assert.ok(showsEnvSecrets(command, dir), `${command} was allowed`);
  }
});

test('loading, copying, listing, editing and testing a .env file, and ordinary commands, pass', (t) => {
  const dir = emptyDir(t);
  for (const command of [
    'node --env-file=.env scripts/harness-bench.mjs',
    'node --env-file=.env -e "process.exit(process.env.SUPABASE_URL ? 0 : 1)"',
    'npx dotenv -e .env -- node scripts/x.mjs',
    'set -a; . ./.env; set +a; node scripts/x.mjs',
    'cp .env ../wt/.env',
    'ls -la .env*',
    'test -f .env && echo present',
    'Test-Path .env',
    'cat .env.example > .env',
    "sed -i 's/^OLD=.*/OLD=x/' .env",
    'grep -q SUPABASE_URL .env',
    'grep -c KEY .env',
    'echo "${SUPABASE_ACCESS_TOKEN:+set}"',
    'printenv HOME',
    'echo $PATH',
    "$env:DEV_PORT = '5300'",
    'env -u DEBUG node scripts/x.mjs',
    'set -euo pipefail',
    'cat .env.example',
    'cat .env.bench',
    'cat .envrc',
    'cat src/env.ts',
    'git status',
    "git commit -m 'Refuse `cat .env` in agent sessions'",
    'grep -rn "process.env" api/',
    // Searching FOR the text ".env" is not reading the file.
    'grep -n "\\.env" scripts/bench-env.mjs',
    'rg "\\.env" scripts',
    "grep -n '.env.local' docs/VERIFICATION.md",
    "sed -n '/\\.env/p' scripts/bench-env.mjs",
  ]) {
    assert.equal(showsEnvSecrets(command, dir), null, command);
  }
});

test('a recursive search is refused only over a folder that holds a secret .env, with no exclusion', (t) => {
  const dir = emptyDir(t);
  assert.equal(showsEnvSecrets('grep -rn E2E_PASSWORD .', dir), null, 'no .env here');
  writeFileSync(join(dir, '.env'), '');
  for (const command of ['grep -rn E2E_PASSWORD .', 'grep -R password', `grep -r KEY ${dir}`, 'rg --no-ignore KEY', 'rg -uu KEY .']) {
    assert.match(showsEnvSecrets(command, dir) ?? '', /would search .*\.env/, command);
  }
  assert.ok(showsEnvSecrets("rg -uu -g '.env*' KEY .", dir), 'a glob that picks the .env files');
  for (const command of [
    "grep -rn --exclude='.env*' E2E_PASSWORD .",
    'grep -rniE "test (credential|account)" --include=*.md .',
    'grep -rl E2E_PASSWORD .',
    'rg KEY .',
    "rg -uu -g '!.env*' KEY .",
    'rg --no-ignore -t ts KEY .',
  ]) {
    assert.equal(showsEnvSecrets(command, dir), null, command);
  }
});

test('Read and Grep are refused on a .env file, and a committed one or a file listing passes', () => {
  assert.match(readsEnvSecrets('Read', { file_path: 'C:\\claude\\NoaCG-Studio\\.env' }), /Read would show/);
  assert.match(readsEnvSecrets('Read', { file_path: '/repo/.env.bench.local' }), /Read would show/);
  assert.match(readsEnvSecrets('Grep', { pattern: 'KEY', path: '/repo/.env', output_mode: 'content' }), /Grep would print/);
  assert.match(readsEnvSecrets('Grep', { pattern: 'KEY', glob: '.env*', output_mode: 'content' }), /Grep would print/);
  assert.match(readsEnvSecrets('Grep', { pattern: 'KEY', glob: '*.env*', output_mode: 'content' }), /Grep would print/);
  assert.equal(readsEnvSecrets('Grep', { pattern: 'KEY', glob: '*.{ts,mjs}', output_mode: 'content' }), null);
  assert.equal(readsEnvSecrets('Read', { file_path: '/repo/.env.example' }), null);
  assert.equal(readsEnvSecrets('Read', { file_path: '/repo/scripts/bench-env.mjs' }), null);
  assert.equal(readsEnvSecrets('Grep', { pattern: 'KEY', path: '/repo/.env' }), null, 'the default mode lists files only');
  assert.equal(readsEnvSecrets('Grep', { pattern: 'KEY', path: '/repo', output_mode: 'content' }), null);
});

test('the committed .env files are exactly the ones git tracks', () => {
  const tracked = spawnSync('git', ['ls-files', '--', '.env*', '**/.env*'], { encoding: 'utf8', windowsHide: true }).stdout
    .split('\n').map((line) => line.trim().split('/').pop()).filter(Boolean);
  assert.deepEqual([...new Set(tracked)].sort(), [...COMMITTED_ENV_FILES].sort());
  assert.equal(isSecretEnvFile('.env'), true);
  assert.equal(isSecretEnvFile('.ENV.LOCAL'), true);
});
