// WHICH BACKEND A CONFIGURED RUN IS ALLOWED TO TOUCH (issue #2495).
//
// The configured suite signs in, writes real rows and deletes them, and several of its specs hold
// the SERVICE ROLE key - an admin credential that ignores every row-level rule. Which project all
// that lands in is decided by one environment variable, `VITE_SUPABASE_URL`, and nothing ever
// checked it.
//
// WHAT THAT COST, 2026-11-13. A cloud worker's own environment points at the PRODUCTION project
// and carries the production service key, because the same container also runs tooling that reads
// production. A plan-run worker queued two configured runs without first loading the local
// stack's settings; both ran against production. `publish-guard.spec.ts` wrote `system_settings`
// with the admin key - its cleanup set `production_copies` to `{on:false}`, the switch every live
// page reads - and the suite wrote the test account's productions there too. Eleven minutes of
// production, restored by hand.
//
// Nothing in the suite was wrong; the suite simply did what it was pointed at. So the rule here
// is about the TARGET, not about any one spec:
//
//   A configured run may only reach a Supabase the run itself owns and can destroy.
//
// In practice that is the LOCAL stack - `supabase start` on this machine or on the runner, which
// is what `.github/actions/configured-stack` hands both CI jobs (its `API_URL` is
// `http://127.0.0.1:54321`). The one other target that was ever legitimate is the hosted STAGING
// project `hosted-latency.yml` measures real network latency against, and that one must now SAY
// so: an explicit `NOACG_CONFIGURED_TARGET=hosted-staging`. A declaration cannot be arrived at by
// accident, which is the whole difference between that workflow and the incident - an ambient
// environment nobody chose carries no declaration.
//
// WHY A SEPARATE MODULE rather than a line in the config. Three entry points need the same
// answer - `e2e/_configured-guard.ts` (the `globalSetup` of every configured run),
// `e2e/configured/_helpers.ts` (the module every admin write in the suite takes its key from)
// and the unit test that pins the rules - and a rule copied three times is a rule
// that drifts. It is `.mjs` so a Playwright config, a TypeScript spec and `node --test` can all
// import it.
//
// This does NOT cover the offline suite (`playwright.config.ts`): it pins the Supabase pair EMPTY
// in `webServer.env` and `e2e/_offline-guard.ts` refuses a server that does not serve those empty
// values, so an offline run cannot reach any backend whatever its shell holds. It also does not
// cover `playwright.production.config.ts`, whose whole point is the deployed site: that suite is
// anonymous, writes nothing, and runs with no Supabase variables set (`deploy-verify.yml`) - but
// a shell that has exported a production `.env` wholesale is refused there too, through
// `_helpers.ts`, and unsetting those two variables is the fix.
//
// ONE PLACE THE PROBE READS LESS THAN IT LOOKS. `e2e/configured/measure/measure.config.ts` with
// MEASURE_BUILD=prod puts a switch in front of two servers, and the served-backend probe reads the
// development one. A bundled build's backend was fixed when `vite build` ran, out of whatever
// environment file was there then, so nothing at run time can read it back; what holds that half
// is this process's own environment, which is judged first and by the same rule.

import { stagingRef } from './supabase-projects.mjs';

/** Every variable a configured run or `api/` can take a backend from (api/_lib/*: SUPABASE_URL wins). */
export const URL_VARS = ['SUPABASE_URL', 'VITE_SUPABASE_URL'];

/** The admin credentials. Their presence is not what decides; they are named in the refusal. */
export const KEY_VARS = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY'];

/**
 * The declaration a non-local target must carry, and the only thing it may say: `hosted-staging`,
 * the staging project `hosted-latency.yml` measures real network latency against - a writing run,
 * on a project the org owns and can empty.
 *
 * There is deliberately no second value for `playwright.production.config.ts`, which shares
 * `e2e/configured/` as its directory and so reaches this rule when Playwright collects it. That
 * suite is anonymous and writes nothing, and rather than inventing a word that means "do not
 * check", the config unsets the backend variables for its own process: it HAS no backend, its
 * target is a URL of its own, and the honest answer here is then `unconfigured`.
 */
export const DECLARATION = 'NOACG_CONFIGURED_TARGET';
export const HOSTED_STAGING = 'hosted-staging';

/**
 * The production project's ref, refused whatever else is set. `hosted-latency.yml` has carried the
 * same refusal since it was written ("a wrong-project secret is the one mistake that would be
 * catastrophic rather than merely broken: this suite DELETES rows"); it is a project id, public in
 * every deploy log, not a credential.
 */
export const NEVER_REFS = ['kprolrchuldgfrzspthy'];

/** `supabase start` on this machine or this runner. A port is required: a bare host is not a stack. */
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+(\/|$)/;

// Hostnames are case-insensitive, and so is the scheme: `HTTPS://KPROLRCHULDGFRZSPTHY.supabase.co`
// is the production project however it is typed. Every URL comparison below is made on the folded
// value, so a capital letter cannot walk past either the local test or the refused ref.
const read = (env, name) => (env[name] ?? '').trim().toLowerCase();

/**
 * What a message may say about a URL: its host, never the whole value.
 *
 * A hostname is public - every visitor's browser already sends it. The rest of a URL is not
 * necessarily: a URL can carry a password (`https://user:pw@host`), and in `hosted-latency.yml`
 * the value itself comes from a GitHub secret, which is masked in a log only when it matches
 * EXACTLY - a folded or trimmed copy prints in the clear. The host answers the only question a
 * refusal has to answer: which database was this about.
 */
function host(url) {
  try {
    return new URL(url).host || '(no host)';
  } catch {
    return '(unreadable URL)';
  }
}

/**
 * Is this URL a Supabase stack on this machine? Exported because the same question is asked by
 * every run that mints a local stack of its own - `playwright.endurance.config.ts` and
 * `e2e/endurance/editor-projects.config.ts` asked it with a weaker pattern of their own, which
 * accepted a bare `http://localhost:` with no port and knew nothing of `[::1]` or letter case.
 * One pattern means tightening it once tightens it everywhere.
 */
export const isLocalStackUrl = (url) => LOCAL.test((url ?? '').trim().toLowerCase());

/**
 * What this environment points a configured run at.
 *
 * `kind` is one of:
 *   - `local`           a Supabase on this machine; the run may do anything it likes to it.
 *   - `hosted-staging`  the declared staging project; allowed, and named in the run's log.
 *   - `unconfigured`    no backend at all. Allowed: every configured spec gates itself off with
 *                       `test.skip(!haveCreds, …)`, and the suite's own verdict refuses a run that
 *                       executed nothing - so an empty environment ends as a loud zero, not as a
 *                       write to somebody's database.
 *   - `refused`         anything else, with `reason` saying what was seen and what to do.
 */
export function configuredTarget(env = process.env) {
  const urls = URL_VARS.map((name) => [name, read(env, name)]).filter(([, value]) => value !== '');
  const declared = read(env, DECLARATION);
  const keys = KEY_VARS.filter((name) => read(env, name) !== '');
  const held = keys.length > 0 ? ` An admin key is in this environment (${keys.join(', ')}).` : '';

  const refuse = (reason) => ({ kind: 'refused', urls, reason });
  const banned = urls.filter(([, value]) => NEVER_REFS.some((ref) => value.includes(ref)));
  if (banned.length > 0) {
    return refuse(
      `${banned.map(([name]) => name).join(' and ')} points at the PRODUCTION project. A configured run signs in, writes rows, deletes them and can hold an admin key, so it may never run there (issue #2495).${held}`,
    );
  }

  if (declared !== '' && declared !== HOSTED_STAGING) {
    return refuse(`${DECLARATION} is "${declared}"; the only value that admits a non-local backend is "${HOSTED_STAGING}".`);
  }

  if (urls.length === 0) {
    return declared === HOSTED_STAGING
      ? refuse(`${DECLARATION}=${HOSTED_STAGING} was declared but no backend URL is set (${URL_VARS.join(' or ')}).`)
      : { kind: 'unconfigured', urls };
  }

  const nonLocal = urls.filter(([, value]) => !LOCAL.test(value));
  if (nonLocal.length === 0) return { kind: 'local', urls };

  if (declared === HOSTED_STAGING) {
    // THE DECLARATION NAMES ONE PROJECT, not "hosted and not production". A run may only reach a
    // backend it owns and can empty, and the org owns exactly one hosted project like that: the
    // staging project `scripts/supabase-projects.mjs` already names for the drift check and the
    // advisor gate (`STAGING_SUPABASE_PROJECT_REF` overrides it for a fork). Without this, a
    // rotated or mistyped `STAGING_SUPABASE_URL` would be admitted because it merely is not
    // production - which is somebody else's database, and the suite deletes rows.
    const ref = stagingRef(env);
    // The WHOLE host, not a substring of the URL and not a prefix of the host: a project's
    // hostname is `<ref>.supabase.co` and nothing else. `.includes(ref)` would admit a path or
    // query carrying the word, and `startsWith(ref + '.')` would admit
    // `<ref>.somebody-elses-domain.example`, which is a different machine entirely.
    const elsewhere = urls.filter(([, value]) => host(value) !== `${ref}.supabase.co`);
    return elsewhere.length === 0
      ? { kind: HOSTED_STAGING, urls }
      : refuse(
          `${DECLARATION}=${HOSTED_STAGING} admits the staging project only, and ${elsewhere.map(([name]) => name).join(' and ')} names another: ${elsewhere.map(([, value]) => host(value)).join(', ')}.${held} A run may only reach a backend it owns and can empty.`,
        );
  }

  return refuse(
    `${nonLocal.map(([name]) => name).join(' and ')} is not a local Supabase stack: ${nonLocal.map(([, value]) => host(value)).join(', ')}.${held} A configured run may only reach a stack it owns - start one (supabase start) and take its settings from \`supabase status\`, as .github/actions/configured-stack and scripts/configured-trial.mjs do. The hosted staging project is the one exception and must say so: ${DECLARATION}=${HOSTED_STAGING} (.github/workflows/hosted-latency.yml).`,
  );
}

/**
 * Every backend variable a run should carry, set to one local stack.
 *
 * The wrappers that mint a stack (`scripts/configured-trial.mjs`, `scripts/endurance-election.mjs`,
 * `scripts/editor-projects-qualification.mjs`) each spread `process.env` and then overrode the
 * variables they happened to think of. On a cloud worker the ambient environment names PRODUCTION
 * and carries its admin key, so whatever a wrapper forgot stayed production - and the api/
 * handlers the dev server mounts read `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in preference to
 * the spellings the browser uses. Taking the whole set from one place is what keeps "pinned the
 * browser's half" from being mistaken for "pinned the backend".
 */
export function localStackEnv(stack) {
  return {
    VITE_SUPABASE_URL: stack.API_URL,
    VITE_SUPABASE_ANON_KEY: stack.ANON_KEY,
    SUPABASE_URL: stack.API_URL,
    SUPABASE_ANON_KEY: stack.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: stack.SERVICE_ROLE_KEY,
    // The admin key `api/_lib/*` prefers. Left set from the shell it would outrank the one above
    // and send the server's half somewhere else entirely.
    SUPABASE_SECRET_KEY: stack.SERVICE_ROLE_KEY,
  };
}

/**
 * The rule applied to what a dev server SERVES: this environment, with the served URL in place of
 * the ones this process named. Shared with `e2e/_configured-guard.ts` so it can be tested without
 * a server, and so the guard cannot quietly judge it by a different rule.
 */
export function servedTarget(served, env = process.env) {
  return configuredTarget({ ...env, SUPABASE_URL: '', VITE_SUPABASE_URL: served ?? '' });
}

/** A one-line description for a run's log. Names each variable and its HOST; see `host` above. */
export function describeTarget(target) {
  if (target.kind === 'unconfigured') return 'no backend configured - the configured specs will skip themselves';
  return `${target.kind}: ${target.urls.map(([name, value]) => `${name}=${host(value)}`).join(' ')}`;
}

/**
 * Refuse the run unless this environment names a LOCAL stack - `unconfigured` included.
 *
 * `assertConfiguredTarget` admits an environment with no backend at all, because the configured
 * suite's specs gate themselves off without credentials and its verdict refuses a run that
 * executed nothing. A run that does NOT skip itself cannot take that answer: the endurance walks
 * sign in, delete the account's productions and wipe its graphics the moment they start, and
 * their Vite server fills what this process left unset out of the environment file - which on a
 * maintainer's machine is production. "Nothing here names a backend" is not the same as "the
 * backend is local", and only the second is safe for a run that writes from its first step.
 */
export function requireLocalStack(env = process.env, what = 'this run') {
  const target = assertConfiguredTarget(env, what);
  if (target.kind !== 'local') {
    throw new Error(
      `Refusing to start ${what}: it writes from its first step, so it needs a local Supabase stack of its own, ` +
        `and this environment names ${target.kind === 'unconfigured' ? 'no backend at all' : `a ${target.kind} one`}. ` +
        `Start one (supabase start) and take every backend variable from \`supabase status\`.`,
    );
  }
  // EVERY spelling, set and local - not merely "the ones that are set are local". A run can hold a
  // local SUPABASE_URL, which is the half the api/ handlers read, and no VITE_SUPABASE_URL at all;
  // the rule above calls that local, because what is there is. The browser's half would then come
  // from the environment file the Vite server loads, which on a maintainer's machine is
  // production - the same gap in the opposite direction from the one that started this.
  // At most one: the verdict above is `local`, which already means every variable that IS set
  // names a local stack, so what can be missing here is the other spelling.
  const [missing] = URL_VARS.filter((name) => !isLocalStackUrl(read(env, name)));
  if (missing) {
    throw new Error(
      `Refusing to start ${what}: ${missing} must name the local stack too, and it does not. ` +
        `Each half of the run reads its own: the browser's page is built from VITE_SUPABASE_URL and the api/ handlers ` +
        `read SUPABASE_URL, so one left unset is filled from the environment file instead. Take every backend variable ` +
        `from \`supabase status\` (scripts/configured-target.mjs's localStackEnv does exactly that).`,
    );
  }
  return target;
}

/**
 * Refuse the run unless this environment's backend is one a configured run may destroy.
 * `what` names the caller, so the message says which door the run was trying.
 */
export function assertConfiguredTarget(env = process.env, what = 'this run') {
  const target = configuredTarget(env);
  if (target.kind === 'refused') throw new Error(`Refusing to start ${what}. ${target.reason}`);
  return target;
}
