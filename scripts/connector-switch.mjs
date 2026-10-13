#!/usr/bin/env node
// Turns the NoaCG connector on or off for ONE named Supabase project, or says which it is.
//
//   node scripts/connector-switch.mjs <staging|production> <on|off|status> [--hook-off]
//   node scripts/connector-switch.mjs --ref <branch ref> <on|off|status> [--hook-off]
//
// The connector is on for a project exactly when its Auth runs the OAuth server with dynamic
// registration (docs/REMOTE_MCP_PLAN.md, "Owner's steps"). This is the owner's switch, so it is a
// committed command rather than pasted shell helpers: each of three checks of the runbook found
// pasted shell state acting on the wrong project or failing silently (a URL fixed at paste time,
// an off body Auth refused unseen, a helper named like GNU `patch` that hung on the terminal).
//
// What it promises:
// - It acts only on the project named on its command line. `staging` and `production` map to refs
//   through scripts/supabase-projects.mjs; `--ref` takes only a preview branch of production (the
//   branch list says so), for rehearsing on a throwaway branch. The project is the first line out.
// - `on` sets, in this order, the security notification emails, the access token hook and the
//   OAuth server; `off` sets the OAuth server off, and with `--hook-off` the hook after it, never
//   before: a hook off while the OAuth server runs would hand chat clients unlocked tokens.
//   Auth refuses an OAuth change without `oauth_server_authorization_path`, so both bodies send it.
// - After each change it reads Auth's config back and compares every sent setting by value.
// - It ends on the check the site itself makes: Auth's discovery document, and on production
//   https://noacg.studio/mcp, 401 when on and 503 when off, once every warm instance's one-minute
//   cache of Auth's answer has run out.
// - Anything else is a line starting REFUSED or NOT and a non-zero exit. `status` only reads.
// - Every request has a timeout and it never reads the terminal, so it cannot hang silently.
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { envRoot, loadEnvFile } from './read-dotenv.mjs';
import { productionRef, stagingRef } from './supabase-projects.mjs';

const API = 'https://api.supabase.com';
export const PRODUCTION_SITE = 'https://noacg.studio';
const TIMEOUT_MS = 20_000;
const POLL_MS = 5_000;
const AUTH_WAIT_MS = 180_000;
// Each warm noacg.studio instance keeps Auth's answer for a minute; off reached 503 40 to 66 s
// after Auth flipped across four measured offs. Wait that out, then poll for up to a minute more.
const SITE_CACHE_MS = 65_000;
const SITE_WAIT_MS = 60_000;
const READBACK_MS = 60_000;
const READBACK_POLL_MS = 3_000;

const EMAILS = Object.fromEntries(
  ['password_changed', 'email_changed', 'phone_changed', 'mfa_factor_enrolled', 'mfa_factor_unenrolled', 'identity_linked', 'identity_unlinked']
    .map((event) => [`mailer_notifications_${event}_enabled`, true]),
);
const HOOK_ON = {
  hook_custom_access_token_enabled: true,
  hook_custom_access_token_uri: 'pg-functions://postgres/public/connector_access_token',
};
const HOOK_OFF = { hook_custom_access_token_enabled: false };
// `"/"` in the off body too: it is what `on` sets, and Auth accepts it with the server off.
const OAUTH_ON = { oauth_server_enabled: true, oauth_server_allow_dynamic_registration: true, oauth_server_authorization_path: '/' };
const OAUTH_OFF = { oauth_server_enabled: false, oauth_server_allow_dynamic_registration: false, oauth_server_authorization_path: '/' };

/** The bodies, in the order they are sent. Exported so the tests pin them. */
export const STEPS = {
  on: [['security notification emails on', EMAILS], ['access token hook on', HOOK_ON], ['OAuth server on', OAUTH_ON]],
  off: [['OAuth server off', OAUTH_OFF]],
  hookOff: ['access token hook off', HOOK_OFF],
};

const USAGE = 'say: node scripts/connector-switch.mjs <staging|production> <on|off|status> [--hook-off]\n' +
  '  or, on a throwaway preview branch of production only: node scripts/connector-switch.mjs --ref <branch ref> <on|off|status> [--hook-off]';

class Refused extends Error {}
class Not extends Error {}

function parseArgs(argv) {
  const args = { hookOff: false, ref: null, words: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--hook-off') args.hookOff = true;
    else if (argv[i] === '--ref') args.ref = argv[++i] ?? '';
    else if (argv[i].startsWith('-')) throw new Refused(`unknown option ${argv[i]}\n${USAGE}`);
    else args.words.push(argv[i]);
  }
  const [name, action] = args.ref === null ? args.words : [null, ...args.words];
  if (args.words.length !== (args.ref === null ? 2 : 1)) throw new Refused(`${args.ref === null ? 'name a project and an action' : '--ref takes the place of the project name'}\n${USAGE}`);
  if (name !== null && name !== 'staging' && name !== 'production') throw new Refused(`unknown project "${name}"\n${USAGE}`);
  if (!['on', 'off', 'status'].includes(action)) throw new Refused(`unknown action "${action}"\n${USAGE}`);
  if (args.hookOff && action !== 'off') throw new Refused('--hook-off goes with off only: the hook is turned off after the OAuth server, never on its own');
  return { name, action, ref: args.ref, hookOff: args.hookOff };
}

/** One value both from `.env` and from this window: refuse when they name different things. */
function agreed(key, fileEnv, shellEnv) {
  const file = (fileEnv[key] ?? '').trim();
  const shell = (shellEnv[key] ?? '').trim();
  if (file && shell && file !== shell) {
    throw new Refused(`this window sets ${key}=${shell} but .env says ${file}, so the project name is ambiguous; run it in a new window`);
  }
  return shell || file;
}

/** The refs `staging` and `production` stand for, from the same module the landing uses. */
export function projectRefs(fileEnv, shellEnv) {
  const production = productionRef({ VITE_SUPABASE_URL: agreed('VITE_SUPABASE_URL', fileEnv, shellEnv) });
  const staging = stagingRef({ STAGING_SUPABASE_PROJECT_REF: agreed('STAGING_SUPABASE_PROJECT_REF', fileEnv, shellEnv) });
  return { production, staging };
}

async function request(io, method, url, { token, body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) };
  try {
    const res = await io.fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON: the text is the message */ }
    return { status: res.status, text, json };
  } catch (error) {
    return { status: 0, text: error?.name === 'AbortError' ? `no answer in ${TIMEOUT_MS / 1000} s` : String(error?.message ?? error), json: null };
  } finally {
    clearTimeout(timer);
  }
}

/** A Management API call that must succeed; anything else is REFUSED with Auth's own words. */
async function managed(ctx, method, route, body) {
  const res = await request(ctx.io, method, `${API}${route}`, { token: ctx.token, body });
  if (res.status >= 200 && res.status < 300 && res.json !== null) return res.json;
  const reason = res.json?.message ?? res.json?.error ?? res.text.slice(0, 300);
  throw new Refused(`${method} ${route}: ${res.status ? `HTTP ${res.status}` : 'no answer'}: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`);
}

/** Every sent setting the config does not hold, compared by value. */
function differences(settings, held) {
  return Object.entries(settings).flatMap(([key, value]) => {
    if (!Object.hasOwn(held, key)) return [`sent ${key}=${JSON.stringify(value)}, Auth holds no setting named ${key}`];
    return isDeepStrictEqual(held[key], value) ? [] : [`sent ${key}=${JSON.stringify(value)}, Auth holds ${JSON.stringify(held[key])}`];
  });
}

/**
 * Send one body and check it twice: in the PATCH's answer (Auth's config as it stored it), then in
 * a fresh read of the config, which the API serves from a cache about ten seconds old (measured
 * on a branch), so it is read again until it agrees, for a minute at most.
 */
async function apply(ctx, label, settings) {
  const answer = await managed(ctx, 'PATCH', `/v1/projects/${ctx.ref}/config/auth`, settings);
  let wrong = differences(settings, answer);
  if (wrong.length) throw new Refused(`${label}: ${wrong.join('; ')}`);
  const deadline = ctx.io.now() + READBACK_MS;
  for (let first = true; ; first = false) {
    const held = await managed(ctx, 'GET', `/v1/projects/${ctx.ref}/config/auth`);
    wrong = differences(settings, held);
    if (!wrong.length) break;
    if (ctx.io.now() >= deadline) throw new Refused(`${label}: read back after ${READBACK_MS / 1000} s: ${wrong.join('; ')}`);
    if (first) ctx.io.out(`...  ${label}: Auth stored it; reading the config back (up to ${READBACK_MS / 1000} s)`);
    await ctx.io.sleep(READBACK_POLL_MS);
  }
  const count = Object.keys(settings).length;
  ctx.io.out(`ok   ${label}: Auth reads back ${count} setting${count === 1 ? '' : 's'} as sent`);
}

async function signingKey(ctx) {
  const { keys = [] } = await managed(ctx, 'GET', `/v1/projects/${ctx.ref}/config/auth/signing-keys`);
  const inUse = keys.find((key) => key.status === 'in_use');
  return { algorithm: inUse?.algorithm ?? 'none', asymmetric: Boolean(inUse && inUse.algorithm !== 'HS256') };
}

/** What a deployment reads: Auth's discovery offers registration exactly when the connector is on. */
async function discovery(ctx) {
  const res = await request(ctx.io, 'GET', `https://${ctx.ref}.supabase.co/auth/v1/.well-known/oauth-authorization-server`);
  if (res.status === 200) return res.json?.registration_endpoint ? 'on' : 'off';
  if (res.status === 404) return 'off';
  return `unreadable (${res.status ? `HTTP ${res.status}` : res.text})`;
}

async function siteCode(ctx) {
  const res = await request(ctx.io, 'POST', `${PRODUCTION_SITE}/mcp`);
  return res.status || `no answer (${res.text})`;
}

async function waitForAuth(ctx, want) {
  ctx.io.out(`...  waiting for Auth's discovery document to read ${want} (up to ${AUTH_WAIT_MS / 60_000} minutes)`);
  const deadline = ctx.io.now() + AUTH_WAIT_MS;
  for (;;) {
    const state = await discovery(ctx);
    if (state === want) break;
    if (ctx.io.now() >= deadline) throw new Not(`NOT ${want}: ${ctx.label}, Auth's discovery reads ${state} after ${AUTH_WAIT_MS / 60_000} minutes`);
    await ctx.io.sleep(POLL_MS);
  }
  ctx.io.out(`ok   Auth's discovery reads ${want}`);
  return ctx.io.now();
}

async function waitForSite(ctx, want, authFlippedAt) {
  if (ctx.name !== 'production') return;
  const code = want === 'on' ? 401 : 503;
  ctx.io.out(`...  waiting for ${PRODUCTION_SITE}/mcp to answer ${code}: each warm instance keeps Auth's answer for a minute`);
  const wait = authFlippedAt + SITE_CACHE_MS - ctx.io.now();
  if (wait > 0) await ctx.io.sleep(wait);
  const deadline = ctx.io.now() + SITE_WAIT_MS;
  let got;
  for (;;) {
    got = await siteCode(ctx);
    if (got === code) break;
    if (ctx.io.now() >= deadline) throw new Not(`NOT ${want}: ${PRODUCTION_SITE}/mcp answers ${got}, not ${code}`);
    await ctx.io.sleep(POLL_MS);
  }
  ctx.io.out(`ok   ${PRODUCTION_SITE}/mcp ${code}`);
}

async function status(ctx) {
  const config = await managed(ctx, 'GET', `/v1/projects/${ctx.ref}/config/auth`);
  const key = await signingKey(ctx);
  const flag = (value) => (value === true ? 'on' : 'off');
  const emails = Object.keys(EMAILS).filter((k) => config[k] === true).length;
  ctx.io.out(`signing key ${key.algorithm} in use${key.asymmetric ? '' : ' (the connector needs an asymmetric key)'}`);
  ctx.io.out(`Auth config: OAuth server ${flag(config.oauth_server_enabled)}, dynamic registration ${flag(config.oauth_server_allow_dynamic_registration)}, ` +
    `authorization path ${JSON.stringify(config.oauth_server_authorization_path ?? null)}; access token hook ${flag(config.hook_custom_access_token_enabled)}; ` +
    `notification emails ${emails} of ${Object.keys(EMAILS).length} on`);
  const auth = await discovery(ctx);
  ctx.io.out(`Auth's discovery reads ${auth}`);
  const site = ctx.name === 'production' ? await siteCode(ctx) : null;
  if (site !== null) ctx.io.out(`${PRODUCTION_SITE}/mcp ${site}`);
  if (config.oauth_server_enabled === true && config.hook_custom_access_token_enabled !== true) {
    throw new Not(`NOT safe: the OAuth server is on without the access token hook; run: node scripts/connector-switch.mjs ${ctx.arg} on (or off)`);
  }
  const expectedSite = { on: 401, off: 503 }[auth];
  if (!expectedSite || (site !== null && site !== expectedSite)) {
    throw new Not(`NOT settled: Auth's discovery reads ${auth}${site !== null ? `, ${PRODUCTION_SITE}/mcp answers ${site}` : ''}; ask again in a minute`);
  }
  ctx.io.out(`${ctx.label}: connector ${auth}`);
}

async function run(argv, io) {
  const args = parseArgs(argv);
  const refs = projectRefs(io.fileEnv, io.shellEnv);
  if (!refs.production) throw new Refused(`production's ref is unknown: no VITE_SUPABASE_URL in ${io.envPath}; run this from the main checkout`);
  if (refs.production === refs.staging) throw new Refused(`staging and production name the same project (${refs.production})`);
  const ctx = { io, name: args.name, action: args.action, ref: '', label: '', arg: args.name };
  if (args.ref !== null) {
    if (!/^[a-z]{20}$/.test(args.ref)) throw new Refused(`--ref "${args.ref}" is not a project ref`);
    if (args.ref === refs.production || args.ref === refs.staging) {
      throw new Refused(`--ref ${args.ref} is ${args.ref === refs.production ? 'production' : 'staging'}; name it instead of --ref`);
    }
    ctx.ref = args.ref;
    ctx.label = `branch ${args.ref}`;
    ctx.arg = `--ref ${args.ref}`;
  } else {
    ctx.ref = refs[args.name];
    ctx.label = `${args.name} (${ctx.ref})`;
  }
  io.out(`== ${ctx.label}${args.ref !== null ? ', throwaway preview branch only' : ''}: ${args.action}${args.hookOff ? ' --hook-off' : ''}`);

  ctx.token = (io.shellEnv.SUPABASE_ACCESS_TOKEN || io.fileEnv.SUPABASE_ACCESS_TOKEN || '').trim();
  if (!ctx.token) throw new Refused(`no SUPABASE_ACCESS_TOKEN in this window or in ${io.envPath}; nothing was changed`);

  if (args.ref !== null) {
    const branches = await managed(ctx, 'GET', `/v1/projects/${refs.production}/branches`);
    const branch = Array.isArray(branches) ? branches.find((b) => b.project_ref === args.ref) : null;
    if (!branch || branch.is_default) throw new Refused(`${args.ref} is not a preview branch of production; --ref is for throwaway branches only`);
    ctx.io.out(`ok   ${args.ref} is production's preview branch "${branch.name}"`);
  }

  if (args.action === 'status') return status(ctx);

  if (args.action === 'on') {
    const key = await signingKey(ctx);
    if (!key.asymmetric) throw new Refused(`the signing key in use is ${key.algorithm}; the connector refuses HS256 tokens, so switch to an asymmetric key first. Nothing was changed`);
    io.out(`ok   signing key ${key.algorithm} in use`);
    for (const [label, settings] of STEPS.on) await apply(ctx, label, settings);
    await waitForSite(ctx, 'on', await waitForAuth(ctx, 'on'));
  } else {
    const [[label, settings]] = STEPS.off;
    await apply(ctx, label, settings);
    const flippedAt = await waitForAuth(ctx, 'off');
    // apply() has read the OAuth server off and Auth's discovery agrees; only now may the hook go.
    if (args.hookOff) await apply(ctx, ...STEPS.hookOff);
    await waitForSite(ctx, 'off', flippedAt);
  }
  io.out(`${ctx.label}: connector ${args.action}`);
}

/** Runs the command with everything it touches passed in; returns the exit code. */
export async function main(argv, io) {
  try {
    await run(argv, io);
    return 0;
  } catch (error) {
    if (error instanceof Not) io.err(error.message);
    else if (error instanceof Refused) io.err(`REFUSED: ${error.message}`);
    else io.err(`REFUSED: ${error?.stack ?? error}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { env: fileEnv, path: envPath } = loadEnvFile(envRoot(root));
  process.exitCode = await main(process.argv.slice(2), {
    fetch: globalThis.fetch,
    fileEnv,
    shellEnv: process.env,
    envPath,
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
}
