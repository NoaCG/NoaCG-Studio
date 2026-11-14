// The live-publishing switches, read or set on purpose (#2560).
//
// The owner keeps three switches in `system_settings` that a person may have to flip during an
// incident: `production_copies`, `auto_publish` and `partial_writes`, each a row whose value is
// `{ "on": true | false }`. Flipping one used to mean a one-off script holding the admin key, which
// the shell guard (scripts/hooks/production-reach.mjs) now refuses. This is the tracked tool for
// it, listed in that guard's PRODUCTION_TOOLS, and it can touch these three keys and nothing else.
//
//   node scripts/production-switch.mjs                         read all three (the default)
//   node scripts/production-switch.mjs --set production_copies off
//
// It reads SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SECRET_KEY (or
// SUPABASE_SERVICE_ROLE_KEY) from the environment, prints the project's host so the target is
// never a guess, and prints each value before and after a write. A write is read back, and the
// command fails unless the switch now says what was asked.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The only keys this tool reads or writes. */
export const SWITCHES = ['production_copies', 'auto_publish', 'partial_writes'];

const USAGE = 'usage: node scripts/production-switch.mjs [--set <production_copies|auto_publish|partial_writes> <on|off>]';

class Refused extends Error {}

function parse(argv) {
  if (argv.length === 0) return { set: null };
  const [flag, key, state, ...rest] = argv;
  if (flag !== '--set' || rest.length > 0) throw new Refused(USAGE);
  if (!SWITCHES.includes(key)) throw new Refused(`"${key ?? ''}" is not one of ${SWITCHES.join(', ')}; this tool touches no other key.`);
  if (state !== 'on' && state !== 'off') throw new Refused(`the state must be on or off, not "${state ?? ''}".`);
  return { set: { key, on: state === 'on' } };
}

function target(env) {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new Refused('set SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) for the project to read.');
  let host;
  try {
    host = new URL(url).host;
  } catch {
    throw new Refused('SUPABASE_URL is not a URL.');
  }
  return { url, key, host };
}

async function rest(io, t, pathAndQuery, init = {}) {
  const headers = { apikey: t.key, 'content-type': 'application/json', ...(init.prefer ? { prefer: init.prefer } : {}) };
  // A legacy service-role key is a JWT and goes in Authorization too; a secret key goes in apikey only.
  if (t.key.startsWith('eyJ')) headers.authorization = `Bearer ${t.key}`;
  const res = await io.fetch(`${t.url}/rest/v1/${pathAndQuery}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  const text = await res.text();
  if (res.status >= 300) throw new Refused(`${init.method ?? 'GET'} ${pathAndQuery.split('?')[0]} answered ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

async function read(io, t) {
  const rows = await rest(io, t, `system_settings?select=key,value&key=in.(${SWITCHES.join(',')})`);
  return Object.fromEntries(SWITCHES.map((key) => [key, rows.find((row) => row.key === key)?.value ?? null]));
}

const show = (value) => (value === null ? 'unset' : value?.on === true ? 'on' : value?.on === false ? 'off' : JSON.stringify(value));

async function run(argv, io) {
  const { set } = parse(argv);
  const t = target(io.env);
  const before = await read(io, t);
  if (!set) {
    io.out(`${t.host}`);
    for (const key of SWITCHES) io.out(`  ${key}: ${show(before[key])}`);
    return;
  }
  // Keep whatever else the row's value holds; only `on` changes.
  const value = { ...(before[set.key] && typeof before[set.key] === 'object' ? before[set.key] : {}), on: set.on };
  await rest(io, t, 'system_settings?on_conflict=key', { method: 'POST', body: { key: set.key, value }, prefer: 'resolution=merge-duplicates' });
  const after = await read(io, t);
  io.out(`${t.host}: ${set.key} ${show(before[set.key])} -> ${show(after[set.key])}`);
  if (after[set.key]?.on !== set.on) throw new Refused(`${set.key} reads ${show(after[set.key])} after the write, not ${set.on ? 'on' : 'off'}.`);
}

/** Runs the command with what it touches passed in; returns the exit code. */
export async function main(argv, io) {
  try {
    await run(argv, io);
    return 0;
  } catch (error) {
    io.err(error instanceof Refused ? `REFUSED: ${error.message}` : `REFUSED: ${error?.message ?? error}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), {
    fetch: globalThis.fetch,
    env: process.env,
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
}
