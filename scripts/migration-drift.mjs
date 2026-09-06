#!/usr/bin/env node
// gate: workflow post-land.yml
// guards: supabase/migrations/**
//
// Do the hosted projects hold every migration this repository has? PRODUCTION, and `noacg-staging`
// beside it.
//
// WHY THIS EXISTS. Migrations live in the repo, but nothing applies them: `supabase db push` is a
// deliberate human act. On 2026-08-25 that gap showed itself - 0051_client_table_grants.sql landed
// on main, was verified against a local stack and against CI, and sat UNAPPLIED on production for
// hours. Nothing anywhere would have said so; it was found by running `supabase migration list`
// for an unrelated reason. A gap that only a coincidence closes is not closed.
//
// WHY IT IS NOT A CI JOB. The migration ledger lives in `supabase_migrations.schema_migrations`,
// which PostgREST does not expose, so reading it remotely needs the Supabase MANAGEMENT API and a
// personal access token. That token is ACCOUNT-WIDE - it enumerates every organisation and
// project, and the same API deletes them - and this repository is public. Putting it in Actions
// would hand a credential far more dangerous than anything the suite was carefully kept away from
// (docs/VERIFICATION.md, configured-suite). So the check runs LOCALLY, where the token already
// lives in .env, at the moment a human is about to land something.
//
// IT NEVER FAILS THE CALLER. Absent credentials, an offline laptop, a slow API: all report and
// exit 0. A check that blocks a landing because someone is on a train is a check people delete.
//
// WHY STAGING IS IN IT TOO. `noacg-staging` is the project the twice-weekly `hosted-latency` job
// runs against, and until 2026-09-02 nothing watched it: it was current only while somebody
// remembered to push it. The teams migrations 0053/0054 then sat unapplied there for a day, and
// the suite went red on a PGRST205 for `public.teams` - which from the failure email is
// indistinguishable from the hosted-only latency regression that job exists to catch. Reporting
// both refs turns "staging is behind" from a twice-weekly red run into a line at landing time,
// which is also where scripts/auto-merge.mjs can act on it.
//
//   node scripts/migration-drift.mjs          # human-readable
//   node scripts/migration-drift.mjs --json   # one JSON line, for the preflight
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ambientEnv } from './read-dotenv.mjs';
import { productionRef, stagingRef } from './supabase-projects.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 15_000;

// ONE definition of "read the checkout's .env", shared with the freshness checks and the paid bench
// runners (scripts/read-dotenv.mjs). THE PRIMARY CHECKOUT IS IN ITS SEARCH ON PURPOSE: `.env` is
// gitignored, so a linked worktree does not have one, and this check's whole point is to run from a
// worktree during safe-merge. Looking only beside the script would make it skip in exactly the place
// it was added for - and a check that is always "not checked" is worse than no check, because it
// reads as reassurance.
const env = ambientEnv(ROOT);

/** Migration versions on disk, using the CLI's own filename rule (`<digits>_<name>.sql`). A glob
 *  would also count a stray helpers.sql and report drift that does not exist. */
function localVersions() {
  let names;
  try {
    names = readdirSync(path.join(ROOT, 'supabase', 'migrations'));
  } catch {
    return [];
  }
  return names
    .map((name) => /^([0-9]+)_.*\.sql$/.exec(name))
    .filter(Boolean)
    .map((m) => m[1])
    .sort();
}

/**
 * The ledger, over the management API.
 *
 * An explicit AbortController with a timer this function CLEARS, rather than
 * `AbortSignal.timeout()`: that helper leaves a live libuv handle behind, and exiting while it is
 * closing aborts the process on Windows - `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`
 * and exit code 127, with the correct answer already printed above it. A caller reading the exit
 * code would have seen a hard failure from a check that had just succeeded.
 */
async function remoteVersions(ref, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'select version from supabase_migrations.schema_migrations order by version' }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`management API answered ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error(body?.message || 'unexpected response shape');
    return body.map((row) => String(row.version)).sort();
  } finally {
    clearTimeout(timer);
  }
}

/** Decide about ONE project, without printing or exiting - so the shape is testable. */
async function driftFor(ref, token, local) {
  if (!ref || !token) {
    return {
      status: 'skipped',
      detail: !ref ? 'VITE_SUPABASE_URL is not set (no .env?)' : 'SUPABASE_ACCESS_TOKEN is not set',
    };
  }
  try {
    const remote = await remoteVersions(ref, token);
    const have = new Set(remote);
    const missing = local.filter((v) => !have.has(v));
    return missing.length
      ? { status: 'drift', missing, local: local.length, remote: remote.length, ref }
      : { status: 'ok', local: local.length, remote: remote.length, ref };
  } catch (error) {
    // Offline, throttled, token expired: say so and stand down. Reporting "unknown" is honest;
    // reporting "fine" would be the failure this script is named after.
    return { status: 'skipped', detail: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Both projects. PRODUCTION stays at the top level, unchanged, because two callers already read it
 * there and a shape change would make an old one silently answer about nothing; staging arrives
 * beside it under its own key.
 */
async function drift() {
  const local = localVersions();
  if (local.length === 0) return { status: 'skipped', detail: 'no migrations found on disk' };

  const token = env.SUPABASE_ACCESS_TOKEN || '';
  const production = await driftFor(productionRef(env), token, local);
  // Sequential on purpose: two queries to the same management API, and a rate limit hit by racing
  // them would report as "not checked" on whichever lost - a check reading as unconfigured when it
  // is merely impatient.
  const staging = await driftFor(stagingRef(env), token, local);
  return { ...production, staging };
}

/** One project's line, so production and staging cannot be described in two different ways. */
function line(label, result) {
  if (result.status === 'drift') {
    return `${label} is missing ${result.missing.length} migration(s): ${result.missing.join(', ')}`;
  }
  if (result.status === 'ok') return `${label} holds all ${result.local} migration(s).`;
  return `${label} not checked: ${result.detail}`;
}

const result = await drift();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result));
} else {
  const { staging, ...production } = result;
  const write = (r, text) => (r.status === 'drift' ? console.error(text) : console.log(text));
  write(production, line('Production', production));
  write(staging, line('Staging', staging));
  if (production.status === 'drift' || staging.status === 'drift') {
    console.error('\nApply them from any checkout: npm run db:push (it classifies each statement and');
    console.error('refuses anything that can remove something, so it needs no permission to run).');
    if (staging.status === 'drift') {
      console.error(`Staging is a second project, so it needs the ref: npm run db:push -- --ref ${staging.ref}`);
    }
  }
}
// No process.exit: this check never fails its caller, and letting node end on its own is what
// keeps that true on Windows.
