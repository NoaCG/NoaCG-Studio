// The production-key guard (#2560): real event JSON into the real command hooks, with a FAKE
// environment - a fake hosted URL, a fake key and a fake token. The hooks only answer; no command
// here is run, so nothing reaches any network, let alone production.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runHook } from './test-lib.mjs';
import { PRODUCTION_TOOLS, productionReachRefusal } from './production-reach.mjs';

const GUARD = new URL('./guard-command.mjs', import.meta.url);
const CODEX = new URL('./codex-guard-command.mjs', import.meta.url);
const bash = (command, cwd = process.cwd()) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd, tool_input: { command } });

/** A session like a cloud worker's: a hosted backend (fake), its admin key and the access token (fake). */
const HOSTED = {
  SUPABASE_URL: 'https://fake-production-ref.supabase.example.test',
  VITE_SUPABASE_URL: 'https://fake-production-ref.supabase.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-key',
  SUPABASE_SECRET_KEY: '',
  SUPABASE_ACCESS_TOKEN: 'fake-access-token',
};
/** The same session pointed at a local stack, with no access token. */
const LOCAL = { ...HOSTED, SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_ACCESS_TOKEN: '' };

const KEY = 'SUPABASE_SERVICE_ROLE_KEY';
const TOKEN = 'SUPABASE_ACCESS_TOKEN';
const REFUSED = [
  `curl -s -H "apikey: $${KEY}" https://fake-production-ref.supabase.example.test/auth/v1/admin/users`,
  `node -e "fetch(u, { headers: { apikey: process.env.${KEY} } })"`,
  `python3 -c "import os; print(len(os.environ['${KEY}']))"`,
  `curl -H "Authorization: Bearer $${TOKEN}" https://api.supabase.com/v1/projects`,
  'npx supabase projects list',
  'supabase db push',
  'cd supabase && supabase functions deploy notify --project-ref abc',
  // Setting the variable to itself, or in code, is not setting it.
  `node -e "const ${KEY}=process.env.${KEY}; fetch(u, { headers: { apikey: ${KEY} } })"`,
  `${KEY}=$${KEY} curl -H "apikey: $${KEY}" https://fake.example.test`,
  // An unset or a production tool in one part of the line does not cover another part.
  `env -u ${KEY} true; curl -H "apikey: $${KEY}" https://fake.example.test`,
  `node scripts/admin.mjs --help; curl -H "apikey: $${KEY}" https://fake.example.test`,
  // Code fed to an interpreter on stdin, and the CLI however it is spelled.
  `node <<'EOF'\nfetch(u, { headers: { apikey: process.env.${KEY} } })\nEOF`,
  'npx supabase@latest db push',
  'supabase --workdir supabase db push',
  'supabase migration repair --status applied 0001',
  'supabase config push',
];
const ALLOWED = [
  `grep -rn ${KEY} scripts`,
  'supabase start',
  'supabase status -o json',
  'supabase db push --local',
  'npm run build',
  `env -u ${KEY} -u SUPABASE_SECRET_KEY -u ${TOKEN} node -e "fetch(u, { headers: { apikey: process.env.${KEY} } })"`,
  `${KEY}=local-key node -e "console.log(process.env.${KEY}.length)"`,
  `${TOKEN}=$${TOKEN} node scripts/supabase-advisors.mjs`,
  // Naming a variable is not using it: a search, a quoted message, text written to a file.
  `grep -rn "process.env.${KEY}" scripts`,
  `git commit -m 'read process.env.${KEY} only in the tools'`,
  `printf '%s' 'fetch(u, { headers: { apikey: process.env.${KEY} } })' > fixture.txt`,
  `git commit -F - <<'EOF'\nDo not expand $${KEY} here\nEOF`,
  'supabase --version',
  'supabase gen types typescript --local',
];

test('a one-off command that uses the production admin key or token is refused, saying why and what to do', () => {
  for (const command of REFUSED) {
    const run = runHook(GUARD, bash(command), HOSTED);
    assert.equal(run.status, 2, `${command} was allowed`);
    assert.match(run.message, /#2560/);
    assert.match(run.message, /supabase start/);
    assert.match(run.message, /db-push\.mjs/);
  }
});

test('ordinary commands, local work and the deliberate production tools still run', () => {
  for (const command of ALLOWED) {
    const run = runHook(GUARD, bash(command), HOSTED);
    assert.equal(run.status, 0, `${command}: ${run.message}`);
  }
});

test('an env file can load the key behind any unset, so it arms the check even in a clean session', () => {
  const clean = Object.fromEntries(Object.keys(HOSTED).map((name) => [name, '']));
  for (const command of [
    `env -u ${KEY} node --env-file=.env -e "fetch(u, { headers: { apikey: process.env.${KEY} } })"`,
    `node -r dotenv/config -e "fetch(u, { headers: { apikey: process.env.${KEY} } })"`,
    `source .env && node -e "fetch(u, { headers: { apikey: process.env.${KEY} } })"`,
  ]) {
    assert.equal(runHook(GUARD, bash(command), clean).status, 2, command);
  }
  assert.equal(runHook(GUARD, bash('node --env-file=.env scripts/admin.mjs --help'), clean).status, 0, 'the production tool still runs');
});

test('the same command against a local stack, with no token, is not this rule\'s business', () => {
  for (const command of REFUSED.slice(0, 3)) {
    const run = runHook(GUARD, bash(command), LOCAL);
    assert.equal(run.status, 0, `${command}: ${run.message}`);
  }
});

test('a one-off script file that reads the key is refused; the same script without it is not', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'noacg-reach-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'oneoff.mjs'), `const { ${KEY} } = process.env;\nawait fetch(process.argv[2], { headers: { apikey: ${KEY} } });\n`);
  writeFileSync(join(dir, 'plain.mjs'), 'console.log(process.env.HOME);\n');
  const refused = runHook(GUARD, bash('node oneoff.mjs https://fake.example.test', dir), HOSTED);
  assert.equal(refused.status, 2, refused.message);
  assert.match(refused.message, /oneoff\.mjs is a script not in the repository/);
  assert.equal(runHook(GUARD, bash('node plain.mjs', dir), HOSTED).status, 0);
  const oneoff = join(dir, 'oneoff.mjs');
  for (const [command, cwd] of [
    [`timeout -s KILL 60 npx tsx ${oneoff}`, process.cwd()],
    [`node --import tsx ${oneoff}`, process.cwd()],
    [`cd ${dir} && node oneoff.mjs`, process.cwd()],
    [`node oneoff.mjs; node ${join(process.cwd(), 'scripts/db-push.mjs')} --help`, dir],
  ]) {
    assert.equal(runHook(GUARD, bash(command, cwd), HOSTED).status, 2, command);
  }
});

test('the Codex guard refuses the same command', () => {
  const run = spawnSync(process.execPath, [new URL(CODEX).pathname], {
    input: JSON.stringify({ ...bash(REFUSED[0]), session_id: 's', turn_id: 't', tool_use_id: 'u' }),
    encoding: 'utf8',
    env: { ...process.env, ...HOSTED },
    windowsHide: true,
  });
  assert.equal(JSON.parse(run.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('every allow-listed production tool exists, so a rename cannot quietly drop one', () => {
  for (const path of PRODUCTION_TOOLS) assert.ok(existsSync(new URL(`../../${path}`, import.meta.url)), path);
  assert.equal(productionReachRefusal('ls', { env: HOSTED }), null);
});
