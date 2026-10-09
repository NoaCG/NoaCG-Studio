// Shared per-candidate dev-server orchestration for the paid benches.
//
// Both the Lite comparison and the vision suite need the same thing: the route under test
// is SERVER configuration (the runners never receive a model id, so they never see a key,
// a route or a provider body), which means varying the candidate means restarting the
// server with a different environment. vite.config.ts fills process.env from .env only for
// keys that are not already set, so an injected route wins while .env still supplies the
// secrets, and nothing here edits .env.

import { spawn } from 'node:child_process';
import { projectRoot } from './api-runtime-build.mjs';
import { devPort } from './dev-port.mjs';
import { envRoot, readCheckoutEnv } from './read-dotenv.mjs';

export const BASE = `http://localhost:${devPort()}`;

/** Read .env without loading it into this process: the bench needs the test-account
 *  credentials, not the provider keys. Parsing lives in scripts/read-dotenv.mjs, so this and
 *  the freshness checks cannot drift on what a line means. Resolved against the project root
 *  rather than the cwd - a bench started from a subdirectory used to find no .env at all and
 *  fall through to the hand-supplied-token path without saying so.
 *
 *  A LINKED WORKTREE HAS NO `.env` of its own, and most bench work happens in one, so the read
 *  falls back to the MAIN checkout (scripts/read-dotenv.mjs `envRoot`). Without that every Pro,
 *  vision and comparison bench hit the same silent fall-through in a worktree - the failure
 *  this comment already describes, reached by a different route. The fallback is ANNOUNCED,
 *  because "which file did this secret come from" must never be a guess. */
export async function readEnvFile() {
  const resolved = envRoot(projectRoot);
  if (resolved !== projectRoot) console.log(`[bench] this checkout has no .env - reading ${resolved}/.env`);
  return readCheckoutEnv(projectRoot);
}

/** Access tokens last about an hour and a full bench outruns that, so one minted at the
 *  start dies partway and takes the remaining candidates with it - after they were paid
 *  for. Callers mint per candidate. Credentials are the dedicated test account the
 *  configured e2e suite already uses (e2e/configured/_helpers.ts). */
export function tokenMinter(fileEnv) {
  const credentials = {
    url: process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || '',
    anon: process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY || '',
    email: process.env.E2E_EMAIL || fileEnv.E2E_EMAIL || '',
    password: process.env.E2E_PASSWORD || fileEnv.E2E_PASSWORD || '',
  };
  const canMint = Object.values(credentials).every(Boolean);
  return {
    canMint,
    async freshToken(fallback = '') {
      if (!canMint) return fallback;
      const response = await fetch(`${credentials.url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: credentials.anon, 'content-type': 'application/json' },
        body: JSON.stringify({ email: credentials.email, password: credentials.password }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await response.json();
      if (!body.access_token) throw new Error('could not mint a bench token');
      return body.access_token;
    },
  };
}

/** OpenRouter provider SLUGS for a model's real endpoints.
 *
 *  A route with an EMPTY allowlist is not configured at all (taskConfigured), so a bench
 *  that injects a model but no allowlist fails closed before spending - which is what the
 *  vision suite did on its first attempt.
 *
 *  The name-to-slug lookup this used to need is GONE: OpenRouter's endpoints API reported a
 *  display name ("Google") whose slug was something else (`google-vertex`), so a second
 *  listing call had to translate it or the allowlist silently matched nothing. Vercel AI
 *  Gateway reports `provider_name` as the slug itself, so there is nothing left to guess
 *  wrong. */
export async function providerAllowlistFor(model) {
  const get = async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.json();
  };
  const detail = await get(`https://ai-gateway.vercel.sh/v1/models/${model}/endpoints`);
  // Tool support, not `structured_outputs`: the gateway publishes no such parameter anywhere,
  // and forced-function tool use is the capability the structured call actually rides on.
  const slugs = [...new Set((detail.data?.endpoints ?? [])
    .filter((e) => (e.supported_parameters ?? []).includes('tools'))
    .map((e) => e.provider_name)
    .filter(Boolean))];
  if (!slugs.length) throw new Error(`no tool-capable endpoint for ${model}`);
  return slugs.join(',');
}

export function startServer(env) {
  // Shares the terminal console so Ctrl+C stops it too: scripts/windows-hide.test.mjs.
  return spawn('npm', ['run', 'dev'], { env: { ...process.env, ...env }, shell: true, stdio: 'ignore', windowsHide: false });
}

/** The dev script is a WRAPPER, so killing the returned child kills the wrapper and
 *  orphans the server holding the port - once per candidate, until the next run fails on
 *  strictPort. Kill the whole tree. */
export function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  }
}

/** Poll a status endpoint until it reports the task is available. A status endpoint does
 *  not expose the model id (by design), so this proves the server is UP and configured -
 *  never which candidate it is serving. The injected environment is that evidence. */
export async function waitForReady(statusPath, token, budgetMs = 90_000) {
  const deadline = Date.now() + budgetMs;
  let lastReason = 'no response';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}${statusPath}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) {
        const status = await response.json();
        if (status.available) return status;
        lastReason = status.reason ?? 'unavailable';
      } else {
        lastReason = `HTTP ${response.status}`;
      }
    } catch { /* still booting */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`dev server never became available (${lastReason})`);
}

/** Give the port time to release before the next candidate binds it: strictPort turns a
 *  late release into a hard failure rather than a silent reassignment. */
export const settlePort = () => new Promise((resolve) => setTimeout(resolve, 3000));
