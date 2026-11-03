#!/usr/bin/env node
// cf04's drills of the configured stack, run on a CI runner through endurance.yml with
// local-supabase on (so the job already holds one stack, claimed by `configured-stack.mjs up`):
//
//   concurrent  two more stacks started AT ONCE beside it, racing for slots: each must come up on
//               its own slot, ports and project, ready, without touching the others; a user made in
//               one must not exist in another; then both are taken down and proved gone.
//   fail        fails on purpose, so the job's `if: always()` teardown runs after a failed step.
//   hold        holds the stack for --minutes, so the run can be cancelled and the teardown is
//               seen running after a cancellation.
//   collide     the diagnosis, reproduced (run with local-supabase off): an ordinary outbound
//               connection whose source port is a stack port, then Docker publishing that port,
//               open and again after the connection closed (TIME_WAIT); then the same port reserved.
//
// Diagnostics only: never part of a pull request's checks.
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLAIMS_ROOT, defaultOwner } from './configured-stack.mjs';

const mode = process.argv[2];
const minutes = Number(process.argv[process.argv.indexOf('--minutes') + 1] || 1);
const job = defaultOwner();

function claims() {
  return readdirSync(CLAIMS_ROOT).filter((n) => /^slot-\d+$/.test(n))
    .map((n) => JSON.parse(readFileSync(join(CLAIMS_ROOT, n, 'state.json'), 'utf8')));
}

function status(workdir) {
  const r = spawnSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', windowsHide: true, env: { ...process.env, SUPABASE_WORKDIR: workdir } });
  if (r.status !== 0) throw new Error(`supabase status for ${workdir}: ${r.stderr}`);
  return JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
}

function node(args, owner) {
  return new Promise((done) => {
    const child = spawn(process.execPath, ['scripts/configured-stack.mjs', ...args, '--owner', owner], { stdio: 'inherit', windowsHide: true, env: { ...process.env, GITHUB_ENV: '' } });
    child.on('exit', (code) => done(code));
  });
}

async function users(s) {
  const r = await fetch(`${s.API_URL}/auth/v1/admin/users`, { headers: { apikey: s.SERVICE_ROLE_KEY, Authorization: `Bearer ${s.SERVICE_ROLE_KEY}` } });
  if (r.status !== 200) throw new Error(`admin/users answered ${r.status} at ${s.API_URL}`);
  return (await r.json()).users.map((u) => u.email);
}

function check(cond, what) {
  if (!cond) throw new Error(what);
  console.log(`ok - ${what}`);
}

async function concurrent() {
  const before = claims();
  check(before.length === 1 && before[0].owner === job, `the job holds one stack before the drill (slot ${before[0]?.slot})`);
  const owners = [`${job}/A`, `${job}/B`];
  const t0 = Date.now();
  const codes = await Promise.all(owners.map((o) => node(['up'], o)));
  console.log(`both starts returned after ${Math.round((Date.now() - t0) / 1000)} s: exit ${codes.join(', ')}`);
  let failure;
  try {
    check(codes.every((c) => c === 0), 'both concurrent starts succeeded, with no retry');
    const all = claims();
    const mine = owners.map((o) => all.find((c) => c.owner === o));
    const stacks = [before[0], ...mine];
    check(new Set(stacks.map((s) => s.slot)).size === 3, `three stacks on three slots: ${stacks.map((s) => s.slot).join(', ')}`);
    check(new Set(stacks.map((s) => s.projectId)).size === 3, `three projects: ${stacks.map((s) => s.projectId).join(', ')}`);
    const st = stacks.map((s) => status(s.workdir));
    check(new Set(st.map((s) => s.API_URL)).size === 3, `three API URLs: ${st.map((s) => s.API_URL).join(', ')}`);
    check(new Set(st.map((s) => s.DB_URL)).size === 3, 'three database URLs');
    const email = `cf04-drill-${Date.now()}@noacg.local`;
    const made = await fetch(`${st[1].API_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: st[1].SERVICE_ROLE_KEY, Authorization: `Bearer ${st[1].SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'cf04-drill-pw', email_confirm: true }),
    });
    check(made.status === 200, `a user made in ${stacks[1].projectId} (admin/users ${made.status})`);
    const seen = await Promise.all(st.map(users));
    check(seen[1].includes(email), `${stacks[1].projectId} has it`);
    check(!seen[0].includes(email) && !seen[2].includes(email), `${stacks[0].projectId} and ${stacks[2].projectId} do not: the databases are separate`);
  } catch (e) {
    failure = e;
  }
  // Taken down whatever happened above; the job's own stack stays for the job's teardown.
  const downs = [];
  for (const o of owners) downs.push(await node(['down'], o));
  if (failure) throw failure;
  check(downs.every((c) => c === 0), 'both drill stacks taken down and proved gone');
  const after = claims();
  check(after.length === 1 && after[0].owner === job, 'only the job\'s own stack is left');
  const s0 = status(after[0].workdir);
  const r = await fetch(`${s0.API_URL}/rest/v1/`, { headers: { apikey: s0.ANON_KEY } });
  check(r.status === 200, `the job's own stack still answers (${r.status}): the drill's teardown touched nothing of it`);
}

function publish(port) {
  const r = spawnSync('docker', ['run', '--rm', '-p', `${port}:80`, 'busybox:1.36', 'true'], { encoding: 'utf8', windowsHide: true });
  return { code: r.status, err: r.stderr.trim().split('\n').pop() };
}

async function collide() {
  const port = 54322; // the port every recorded failure names
  check(spawnSync('docker', ['pull', '-q', 'busybox:1.36'], { stdio: 'inherit', windowsHide: true }).status === 0, 'busybox pulled');
  const range = readFileSync('/proc/sys/net/ipv4/ip_local_port_range', 'utf8').trim().split(/\s+/).map(Number);
  check(port >= range[0] && port <= range[1], `${port} is inside the kernel's ephemeral range ${range.join('-')}: any outbound connection may be given it`);
  check(publish(port).code === 0, `with nothing on ${port}, Docker publishes it`);
  // A connection whose source port is 54322, as an autobound pull connection would have.
  const server = net.createServer((c) => c.on('error', () => {})).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const client = net.connect({ port: server.address().port, host: '127.0.0.1', localPort: port });
  await new Promise((r, j) => { client.once('connect', r); client.once('error', j); });
  const open = publish(port);
  console.log(`docker, connection open: ${open.err}`);
  check(open.code !== 0 && /address already in use/.test(open.err), 'with an open connection from that port, Docker fails exactly as the CI runs did');
  client.end();
  await new Promise((r) => client.once('close', r));
  const tw = spawnSync('ss', ['-Htan', `sport = :${port}`], { encoding: 'utf8', windowsHide: true }).stdout.trim();
  console.log(`after the client closed first: ${tw || '(no socket)'}`);
  const after = publish(port);
  console.log(`docker, connection closed, socket in TIME_WAIT: ${after.code === 0 ? 'published' : after.err}`);
  // Reported, not asserted: whether a TIME_WAIT socket blocks Docker's bind is what this measures.
  console.log(`measured: a TIME_WAIT socket on ${port} ${after.code === 0 ? 'does not block' : 'blocks'} Docker's bind`);
  server.close();
}

const modes = {
  concurrent,
  collide,
  fail: async () => {
    console.log(`stack claims: ${JSON.stringify(claims().map((c) => [c.slot, c.projectId]))}`);
    throw new Error('the deliberate failure of the cf04 cleanup drill; the teardown step comes next');
  },
  hold: async () => {
    console.log(`holding ${JSON.stringify(claims().map((c) => [c.slot, c.projectId]))} for ${minutes} min, to be cancelled`);
    await new Promise((r) => setTimeout(r, minutes * 60_000));
  },
};

if (!modes[mode]) {
  console.error('usage: configured-stack-drill.mjs concurrent|collide|fail|hold [--minutes n]');
  process.exit(2);
}
modes[mode]().catch((e) => {
  console.log(`::error title=cf04 drill ${mode}::${e.message}`);
  process.exit(1);
});
