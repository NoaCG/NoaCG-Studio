import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CLI_CREDENTIALS_ENV, writeCliCredentialsEnv } from './cli-credentials-env.mjs';

const bash = spawnSync('bash', ['-c', 'exit 0']).status === 0;

/** What a Bash command run in `cwd` sees, after Claude Code has sourced the env file. */
function seen(envFile, cwd, env = {}) {
  const base = { ...process.env, ...env };
  if (!('NOACG_CREDENTIALS_DIR' in env)) delete base.NOACG_CREDENTIALS_DIR;
  const r = spawnSync('bash', ['-c', `source "${envFile.replaceAll('\\', '/')}"; printf %s "$NOACG_CREDENTIALS_DIR"`], { cwd, env: base, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

function checkout() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'noacg-checkout-')));
  assert.equal(spawnSync('git', ['init', '-q', dir]).status, 0);
  return dir;
}

/** git prints C:/x on Windows, /x elsewhere - compare the way it prints. */
const asGit = (dir) => `${dir.replaceAll('\\', '/')}/.noacg`;

test('writes nothing when the session gave no env file', () => {
  assert.equal(writeCliCredentialsEnv(''), false);
});

test('each checkout a command runs in gets its own key store; outside one, none', { skip: !bash && 'no bash on this machine' }, () => {
  const envFile = join(mkdtempSync(join(tmpdir(), 'noacg-envfile-')), 'sessionstart-hook-0.sh');
  assert.equal(writeCliCredentialsEnv(envFile), true);
  assert.equal(readFileSync(envFile, 'utf8'), CLI_CREDENTIALS_ENV);

  const [a, b] = [checkout(), checkout()];
  mkdirSync(join(a, 'cli'));
  assert.equal(seen(envFile, a), asGit(a));
  assert.equal(seen(envFile, join(a, 'cli')), asGit(a), 'a subfolder resolves to its checkout root');
  assert.equal(seen(envFile, b), asGit(b), 'a sibling checkout gets a store of its own');
  assert.equal(seen(envFile, a, { NOACG_CREDENTIALS_DIR: 'C:/chosen' }), 'C:/chosen', 'a value already set wins');
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'noacg-plain-')));
  const inGit = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: outside }).status === 0;
  if (!inGit) assert.equal(seen(envFile, outside), '', 'outside a checkout the per-user default stands');
});
