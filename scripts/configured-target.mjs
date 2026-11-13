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
// `e2e/configured/_helpers.ts` (which is where the service key is read, so it is the last line
// before a write) and the unit test that pins the rules - and a rule copied three times is a rule
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

/** Every variable a configured run or `api/` can take a backend from (api/_lib/*: SUPABASE_URL wins). */
export const URL_VARS = ['SUPABASE_URL', 'VITE_SUPABASE_URL'];

/** The admin credentials. Their presence is not what decides; they are named in the refusal. */
export const KEY_VARS = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY'];

/**
 * The declaration a non-local target must carry, and the two things it may say.
 *
 * `hosted-staging` is the staging project `hosted-latency.yml` measures real network latency
 * against: a writing run, on a project the org owns and can empty.
 *
 * `deployed-site` is `playwright.production.config.ts`, which the config SETS ITSELF: that suite
 * shares `e2e/configured/` as its directory but admits only `@production`-tagged tests, which sign
 * in nowhere and write nothing. Its restriction is that `grep`, not this rule, so the URL is not
 * checked - but an admin key has no business in the environment of a run against the deployed
 * site, and one found there is refused. The strict gate every WRITING run passes
 * (`e2e/_configured-guard.ts`) does not accept this declaration at all, so a shell that sets it
 * cannot let the configured suite loose on a hosted project.
 */
export const DECLARATION = 'NOACG_CONFIGURED_TARGET';
export const HOSTED_STAGING = 'hosted-staging';
export const DEPLOYED_SITE = 'deployed-site';

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

  const refuse = (reason) => ({ kind: 'refused', urls, declared, reason });
  const banned = urls.filter(([, value]) => NEVER_REFS.some((ref) => value.includes(ref)));
  if (banned.length > 0) {
    return refuse(
      `${banned.map(([name]) => name).join(' and ')} points at the PRODUCTION project. A configured run signs in, writes rows, deletes them and can hold an admin key, so it may never run there (issue #2495).${held}`,
    );
  }

  if (declared !== '' && declared !== HOSTED_STAGING && declared !== DEPLOYED_SITE) {
    return refuse(`${DECLARATION} is "${declared}"; the only values that admit a non-local backend are "${HOSTED_STAGING}" and "${DEPLOYED_SITE}".`);
  }

  if (declared === DEPLOYED_SITE) {
    return keys.length > 0
      ? refuse(`${DECLARATION}=${DEPLOYED_SITE} is the deployed site's own anonymous suite, and an admin key is in this environment (${keys.join(', ')}). Unset it: nothing that suite runs needs one.`)
      : { kind: DEPLOYED_SITE, urls, declared, reason: '' };
  }

  if (urls.length === 0) {
    return declared === HOSTED_STAGING
      ? refuse(`${DECLARATION}=${HOSTED_STAGING} was declared but no backend URL is set (${URL_VARS.join(' or ')}).`)
      : { kind: 'unconfigured', urls, declared, reason: '' };
  }

  const nonLocal = urls.filter(([, value]) => !LOCAL.test(value));
  if (nonLocal.length === 0) return { kind: 'local', urls, declared, reason: '' };

  if (declared === HOSTED_STAGING) return { kind: HOSTED_STAGING, urls, declared, reason: '' };

  return refuse(
    `${nonLocal.map(([name]) => name).join(' and ')} is not a local Supabase stack: ${nonLocal.map(([, value]) => value).join(', ')}.${held} A configured run may only reach a stack it owns - start one (supabase start) and take its settings from \`supabase status\`, as .github/actions/configured-stack and scripts/configured-trial.mjs do. The hosted staging project is the one exception and must say so: ${DECLARATION}=${HOSTED_STAGING} (.github/workflows/hosted-latency.yml).`,
  );
}

/** A one-line description for a run's log; never prints a key, and a URL is a host, not a secret. */
export function describeTarget(target) {
  if (target.kind === 'unconfigured') return 'no backend configured - the configured specs will skip themselves';
  if (target.kind === DEPLOYED_SITE) return `${DEPLOYED_SITE}: the deployed site's anonymous suite, no admin key present`;
  return `${target.kind}: ${target.urls.map(([name, value]) => `${name}=${value}`).join(' ')}`;
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
