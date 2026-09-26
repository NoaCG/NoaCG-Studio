import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CLI_CREDENTIALS_ENV, MARKER, writeCliCredentialsEnv } from './cli-credentials-env.mjs';

const bash = spawnSync('bash', ['-c', 'exit 0']).status === 0;

/** What the CLI (a node process) sees when a Bash command starts in `cwd`, after Claude Code
 *  has sourced the env file. */
function seen(envFile, cwd, env = {}) {
  const base = { ...process.env, ...env };
  if (!('NOACG_CREDENTIALS_DIR' in env)) delete base.NOACG_CREDENTIALS_DIR;
  const script = `source "${envFile.replaceAll('\\', '/')}"; node -e "process.stdout.write(process.env.NOACG_CREDENTIALS_DIR || '')"`;
  const r = spawnSync('bash', ['-c', script], { cwd, env: base, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.replaceAll('\\', '/').toLowerCase();
}

/** A folder shaped like a checkout: a `.git` entry, and this hook's file when it is one of ours. */
function folder({ ours }) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'noacg-checkout-')));
  mkdirSync(join(dir, '.git'));
  mkdirSync(join(dir, 'cli'));
  if (ours) {
    mkdirSync(join(dir, 'scripts', 'hooks'), { recursive: true });
    writeFileSync(join(dir, MARKER), '');
  }
  return dir;
}

const store = (dir) => `${dir.replaceAll('\\', '/')}/.noacg`.toLowerCase();

test('the marker is this module itself, so moving it cannot silently turn the override off', () => {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  assert.equal(join(repoRoot, MARKER), fileURLToPath(new URL('./cli-credentials-env.mjs', import.meta.url)));
});

test('writes nothing when the session gave no env file', () => {
  assert.equal(writeCliCredentialsEnv(''), false);
});

test('each checkout a command starts in gets its own key store; anywhere else, none', { skip: !bash && 'no bash on this machine' }, () => {
  const envFile = join(mkdtempSync(join(tmpdir(), 'noacg-envfile-')), 'sessionstart-hook-0.sh');
  assert.equal(writeCliCredentialsEnv(envFile), true);
  assert.equal(readFileSync(envFile, 'utf8'), CLI_CREDENTIALS_ENV);

  const [a, b, other] = [folder({ ours: true }), folder({ ours: true }), folder({ ours: false })];
  assert.equal(seen(envFile, a), store(a));
  assert.equal(seen(envFile, join(a, 'cli')), store(a), 'a subfolder resolves to its checkout root');
  assert.equal(seen(envFile, b), store(b), 'a sibling checkout gets a store of its own');
  assert.equal(seen(envFile, a, { NOACG_CREDENTIALS_DIR: 'C:/chosen' }), 'c:/chosen', 'a value already set wins');
  assert.equal(seen(envFile, join(other, 'cli')), '', 'another repository keeps the per-user store');
});
