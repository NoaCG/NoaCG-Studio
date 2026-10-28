#!/usr/bin/env node
// THE ELECTION ENDURANCE RUN (docs/work-specs/playout-expanded-acceptance/spec.md, phase E8.1b), as
// `.github/workflows/endurance.yml` starts it with its local Supabase stack on:
//
//   npm run endurance:election -- --minutes <n>
//
// Before the run: the local stack's identity from `supabase status -o json` (never a hosted
// project), an account made through its admin API and proved by signing in, as configured-suite.yml
// makes its own, and the fixture measured as Postgres measures a report's payload (its jsonb text)
// against the 256 KiB ingress limit. Then the walk (e2e/endurance/election-endurance.ts) for the
// minutes asked. After it: the verdict (scripts/endurance-judge.mjs) printed check by check and kept
// in endurance-output/summary.json beside the whole record; any failed check fails the run.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureFixture } from './endurance-fixture.mjs';
import { judge } from './endurance-judge.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'endurance-output');
const argv = process.argv.slice(2);
const minutes = Number(argv.includes('--minutes') ? argv[argv.indexOf('--minutes') + 1] : 60);
if (!(minutes > 0)) throw new Error('--minutes must be a positive number');

const run = (cmd, args, options = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...options, windowsHide: true });

// The local stack only: its keys are the CLI's published defaults and live only on this machine.
const status = run('supabase', ['status', '-o', 'json'], { cwd: ROOT });
if (status.status !== 0) throw new Error(`no local Supabase stack (supabase status: ${status.stderr.trim()}); start it first, as endurance.yml does with local-supabase`);
const stack = JSON.parse(status.stdout.slice(status.stdout.indexOf('{')));
for (const name of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY']) if (!stack[name]) throw new Error(`supabase status gave no ${name}`);
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(stack.API_URL)) throw new Error(`refusing a stack that is not on this machine: ${stack.API_URL}`);
const env = {
  ...process.env,
  VITE_SUPABASE_URL: stack.API_URL,
  VITE_SUPABASE_ANON_KEY: stack.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: stack.SERVICE_ROLE_KEY,
  E2E_EMAIL: process.env.E2E_EMAIL ?? 'endurance@noacg.local',
  E2E_PASSWORD: process.env.E2E_PASSWORD ?? 'noacg-endurance-local-pw',
  ENDURANCE_MINUTES: String(minutes),
};

// The account, made and proved, as configured-suite.yml does.
const made = await fetch(`${stack.API_URL}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: stack.SERVICE_ROLE_KEY, authorization: `Bearer ${stack.SERVICE_ROLE_KEY}`, 'content-type': 'application/json' },
  body: JSON.stringify({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD, email_confirm: true }),
});
if (!made.ok && made.status !== 422) throw new Error(`could not make the account: ${made.status}`);
const signedIn = await fetch(`${stack.API_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: stack.ANON_KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD }),
});
if (!(await signedIn.json()).access_token) throw new Error('the account cannot sign in');

// The fixture's size, recorded before the run. Postgres measures the payload as the route does
// (0102: octet_length of the payload's jsonb text), through the stack's own database container.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const { projected, ...size } = measureFixture(minutes);
const container = run('docker', ['ps', '--filter', 'name=supabase_db', '--format', '{{.Names}}']).stdout.trim().split('\n')[0];
const sql = `select octet_length(($endurance$${JSON.stringify(projected)}$endurance$::jsonb)::text);`;
const measured = container ? run('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-tA'], { input: sql }) : null;
size.jsonbBytes = measured?.status === 0 ? Number(measured.stdout.trim()) : null;
if (!(size.jsonbBytes > 0)) throw new Error(`could not measure the fixture in Postgres: ${measured?.stderr ?? 'no database container'}`);
if (size.jsonbBytes > size.capBytes || size.bodyBytes > size.capBytes) throw new Error(`the fixture does not fit the ingress limit: ${JSON.stringify(size)}`);
writeFileSync(path.join(OUT, 'fixture-size.json'), `${JSON.stringify(size, null, 2)}\n`);
console.log(`fixture: ${size.candidates} candidates, revision ${size.revision}: request body ${size.bodyBytes} bytes, payload as jsonb ${size.jsonbBytes} bytes, cap ${size.capBytes}`);
env.ENDURANCE_JSONB_BYTES = String(size.jsonbBytes);

const walk = run('npx', ['playwright', 'test', '--config=playwright.endurance.config.ts'], { cwd: ROOT, env, stdio: 'inherit' });

// The verdict, from the record whatever the walk's own exit said.
const recordFile = path.join(OUT, 'record.json');
if (!existsSync(recordFile)) {
  console.log(`FAIL the walk wrote no record (exit ${walk.status})`);
  process.exit(1);
}
const verdict = judge(JSON.parse(readFileSync(recordFile, 'utf8')));
writeFileSync(path.join(OUT, 'summary.json'), `${JSON.stringify({ fixture: size, ...verdict }, null, 2)}\n`);
for (const c of verdict.checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
for (const [road, s] of Object.entries(verdict.timings)) console.log(`timing ${road}: n ${s.n}, p50 ${s.p50} ms, p90 ${s.p90} ms, max ${s.max} ms, slowest ${s.slowest.join(', ')}`);
for (const [road, n] of Object.entries(verdict.excluded)) console.log(road === 'candidatesTooCloseToATake' ? `card corrections not judged, under 2 s before the next Take: ${n}` : `excluded from ${road} (in a fault's window): ${n}`);
for (const line of verdict.unmeasured) console.log(`not measured: ${line}`);
for (const [series, xs] of Object.entries(verdict.memory)) console.log(`window medians ${series}: ${xs.map((x) => (x === null ? '-' : Math.round(x))).join(', ')}`);
for (const [series, s] of Object.entries(verdict.slopes)) console.log(`fitted slope ${series}: ${Math.round(s.perMinute)} per minute, ${Math.round(s.across)} across the steady span`);
for (const l of verdict.lifetimes) console.log(`lifetime ${l.series} from ${Math.round(l.from / 1000)} s: ${Math.round(l.first)} to ${Math.round(l.last)}`);
const passed = verdict.passed && walk.status === 0;
console.log(`${minutes} min: ${passed ? 'passed' : 'FAILED'}`);
process.exit(passed ? 0 : 1);
