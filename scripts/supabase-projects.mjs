// ONE place that names the Supabase projects this repository talks to, so the drift check, the
// landing push and the advisor gate cannot disagree about which database is which.
//
// PRODUCTION IS NEVER HARD-CODED. It is whatever `VITE_SUPABASE_URL` names, so a fork or a
// self-hoster asks about their own project rather than the owner's. Deliberately NOT
// `supabase/.temp/project-ref`, which is the Supabase CLI's LINK state: that is per-checkout and
// untracked, so a worktree linked to staging would make a production check quietly answer about
// the wrong database - a confident wrong answer, which is worse than no answer.
//
// STAGING IS HARD-CODED, because nothing in the app derives it: `noacg-staging` exists only for
// the `hosted-latency` job, in a separate free organisation, and the client is never built against
// it. A PROJECT REF IS NOT A SECRET - it is the public hostname every visitor's browser already
// talks to, and `hosted-latency.yml` names production's ref in its refusal guard for exactly this
// reason. `STAGING_SUPABASE_PROJECT_REF` overrides it for anyone who keeps a staging project of
// their own.
//
// WHY STAGING IS HERE AT ALL. It drifts silently. Migrations reach production automatically when a
// branch lands (scripts/auto-merge.mjs), and staging was outside that: it was current only while
// somebody remembered to push it. On 2026-09-02 the teams migrations 0053/0054 had been on `main`
// for a day, `hosted-latency` went red on a PGRST205 for `public.teams`, and the alarm read like
// the hosted-only latency regression the job exists to catch. Naming staging here is what lets the
// same landing keep both projects in step.

/** The staging project the `hosted-latency` workflow runs against. */
export const DEFAULT_STAGING_REF = 'garafohbzmsybtysxphb';

/**
 * The project this repository calls production, taken from the URL the CLIENT is built against.
 * Empty when there is no `.env` to read it from - callers report that rather than guessing.
 */
export function productionRef(env = {}) {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(env.VITE_SUPABASE_URL || '');
  // Folded like `stagingRef` below, and for the same reason twice over: a ref is a hostname label
  // wherever it is used, and `scripts/connector-switch.mjs` compares the two refs to refuse a run
  // that would change production while calling it staging. One side folded and the other not makes
  // a shouted host slip past that refusal (scripts/connector-switch.test.mjs, issue #2495).
  return match ? match[1].toLowerCase() : '';
}

/** The staging project, overridable so a fork can name its own. */
export function stagingRef(env = {}) {
  // Trimmed and folded: a ref read from a secret can carry a trailing newline or capitals, and it
  // is compared against a hostname, which is case-insensitive. Without this a fork's own correctly
  // configured staging project is refused with a message pointing at the project rather than at
  // the whitespace (scripts/configured-target.mjs, issue #2495).
  return (env.STAGING_SUPABASE_PROJECT_REF || DEFAULT_STAGING_REF).trim().toLowerCase();
}
