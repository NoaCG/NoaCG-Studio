// gate: workflow post-land.yml
// guards: supabase/**
//
// The SUPABASE ADVISOR gate: fails on a NEW advisor finding, ignores the accepted ones.
//
// Why a baseline rather than a plain "run the advisors" check: most of what the advisors report
// here is this project working as designed and will never clear. Two dozen findings are
// `SECURITY DEFINER` functions callable by `anon` - which is the whole capability-URL model
// (docs/CLOUD_PLAYOUT.md, docs/CONTROL_LAYER.md): a CasparCG or OBS client holding an output
// slug is unauthenticated by construction, and switching those to `SECURITY INVOKER` would
// break browser output entirely. Another twenty-one are tables with RLS enabled and no policies,
// which is DENY-ALL - the stricter posture, not a gap; the linter simply cannot tell
// "locked down deliberately" from "forgot to write policies".
//
// So the warning count does not go to zero, and chasing it there would mean dismantling the
// capability model or weakening deny-all. What DOES clear is an accident: 0041 and 0042 each
// removed a definer function that carried Supabase's default EXECUTE grant nobody chose.
// scripts/definer-grants.test.mjs is the offline guard that stops a third one shipping.
//
// A permanent wall of fifty-plus warnings trains you to ignore the report, and then a genuinely
// new one - a table someone added without policies, a function accidentally exposed - arrives
// into a list nobody reads. So this records what has been SEEN AND ACCEPTED and alarms only on
// what is new. Same shape as scripts/overflow-sweep.mjs, for the same reason: ~200 catalog
// variants clip by design, so that gate diffs against a baseline too.
//
// Usage:
//   node scripts/supabase-advisors.mjs                     # fail on anything not in the baseline
//   node scripts/supabase-advisors.mjs --update-baseline   # accept the current findings
//   node scripts/supabase-advisors.mjs --input <file.json> # read a saved payload instead of the API
//   node scripts/supabase-advisors.mjs --json              # machine-readable report
//
// Needs a Management API personal access token in SUPABASE_ACCESS_TOKEN - taken from the real
// environment or from the checkout's `.env`, the same way check-model-ids.mjs finds its provider
// keys (the CLI's own login is stored elsewhere and is deliberately not read here).
//
// WHERE IT RUNS, AND WHY THERE. `.github/workflows/post-land.yml`, straight after the step that
// pushes migrations - the only moment this check can exist. It reads the LIVE project, so a new
// definer function is there to be found only once the migration that creates it has applied, and
// that happens after the merge. Post-land already holds the token, inside the `production`
// GitHub environment.
//
// NOT weekly-audit.yml, which is secret-free on purpose (docs/STACK_FRESHNESS.md). That is not
// squeamishness about secrets in Actions: weekly-audit has `workflow_dispatch` with no
// environment, so a token there would be readable by YAML on any branch anyone dispatches it
// from, where post-land's is scoped to an environment. It would also answer a week late about a
// database that changes on landings.
//
// EXIT CODES ARE THE INTERFACE, because the workflow acts differently on each and "could not
// look" is never "looked, fine". The split between 2 and 3 is whose defect it is, which is the
// only question that changes what a reader should do about it:
//   0  no finding that is new against the baseline
//   1  a NEW finding - the alarm this exists to raise. post-land reds.
//   2  could not check, and the fault is on THIS side: no token, no project ref, no baseline to
//      compare against, a baseline whose shape changed, or a bug in this file. post-land reds,
//      because every one of those is actionable and none may switch the alarm off quietly.
//   3  could not check, and the outside world is why: the Management API would not answer, or
//      answered something that could not be compared against the baseline. post-land warns.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ambientEnv } from './read-dotenv.mjs';
import { measured } from './measured.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = ambientEnv(root);
const BASELINE = resolve(root, 'supabase/advisor-baseline.json');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const updating = args.includes('--update-baseline');
const inputArg = args.includes('--input') ? args[args.indexOf('--input') + 1] : null;

/**
 * Why each CLASS of finding is accepted. Keyed by the advisor's lint name.
 *
 * This explains a class; it never admits a member. A NEW table with RLS and no policies still
 * fails even though `rls_enabled_no_policy` is listed here - that is exactly the case worth
 * catching, and a reason that auto-accepted its whole class would silence it.
 */
const ACCEPTED_CLASSES = {
  rls_enabled_no_policy:
    'RLS on with no policies is DENY-ALL. These tables are reached only through SECURITY ' +
    'DEFINER functions or the service role, which is the stricter posture, not a gap.',
  anon_security_definer_function_executable:
    'The capability-URL model: an output/control slug is held by an unauthenticated playout ' +
    'client (CasparCG/OBS/vMix), so these RPCs must be anon-callable. docs/CLOUD_PLAYOUT.md. ' +
    'NOTE: control_send, control_send_many and control_stage WRITE, so anyone holding a slug ' +
    'can append to the log. That is the design, but it is an abuse-rate question the linter ' +
    'cannot ask - accepted here as reachability, not as a judgement about volume. ' +
    'control_data_patch_by_slug (0060) writes too, and it is the one that writes DURABLE state ' +
    'rather than the append-only log: it patches control_shows.data. Accepted on the same ' +
    'reachability ground - operating a production needs no account, and the slug is what says you ' +
    'may - with the unrestricted apply beneath it, control_data_apply, kept to service_role. ' +
    'ACCEPTING THE REACHABILITY IS NOT A CLAIM THAT ITS GUARD IS TIGHT: measured on staging ' +
    '2026-09-16, that guard reads the path and never the value, so `{"drivers":[]}` still deletes ' +
    'a whole bound branch through the array carve-out. That is tracked as its own work in ' +
    'docs/backlog/the-operator-door-guards-a-branch-and-not-a-leaf.md and the fix is migration ' +
    '0061; it is a bug in the guard, not a reason to revoke a grant the product needs. ' +
    'The numbered-log RPCs of 0071 (control_send_seq, control_output_report_seq, ' +
    'control_show_resolve, control_output_resolve, control_tail_seq, control_output_tail_seq) are ' +
    'the same slug doors with the same guards: the send and the report write only the log and the ' +
    'production head (control_heads), and the reads answer only what the old resolve and tail ' +
    'already did plus the sequence and per-graphic summary the log implies. ' +
    'control_ping_seq (0072) is the same door again: Prepare for Live sends it from the operator ' +
    'page, and it writes ONE log row with an empty graphic under the same locks and burst cap as ' +
    'control_send_seq, so no graphic, revision, cue or report changes - only the head sequence moves.',
  authenticated_security_definer_function_executable:
    'Signed-in callers reaching the same control and entitlement helpers. The definer rights ' +
    'are what let a policy read a table the caller cannot.',
  auth_leaked_password_protection:
    'HaveIBeenPwned checking requires a paid plan. Revisit when the project moves to Pro. ' +
    '(Enabled on 2026-08-13, so this class should stay empty - a member returning means it was ' +
    'switched back off.)',
  auth_db_connections_absolute:
    'The Auth server holds a fixed 10 connections rather than a percentage of the pool. On the ' +
    'current instance size the two allocations land in the same place, and the setting is ' +
    'dashboard-only (Auth -> Advanced). Worth switching the day the instance is resized up, ' +
    'because an absolute allocation is what makes that resize do nothing for Auth.',
  unindexed_foreign_keys:
    'Admin, audit and ownership back-references on small tables. Worth indexing when a query ' +
    'against one actually shows up slow, not before.',
  unused_index:
    'Indexes for features production has not exercised yet. "Never used" here means no traffic, ' +
    'not a bad index.',
  multiple_permissive_policies:
    'community_templates deliberately grants owner and moderator access through separate ' +
    'policies; merging them would obscure two different reasons for access.',
};

/**
 * The one class whose NEW members are reported as warnings and never fail the run.
 *
 * `unused_index` reads `pg_stat_user_indexes.idx_scan = 0`, a usage counter, not a property of the
 * schema. It is zero for every index a migration has just added (the feature has had no production
 * traffic yet, and the baseline cannot be recorded before production has the index), and it goes
 * back to zero for EVERY index whenever Postgres resets its statistics, which an unclean restart
 * does. On 2026-09-29 that turned 38 indexes from migrations 0003 to 0054 into new findings at once,
 * `render_jobs_active` among them, which production had scanned on 2026-09-24. A finding that fires
 * for a new index, for an old one after a restart, and for nothing a migration did wrong carries no
 * signal for this alarm. Every other class keeps failing on a new member.
 */
export const WARN_ONLY_CLASSES = new Set(['unused_index']);

/**
 * Compare a live report against the baseline. Pure, so the rule that decides the exit code is
 * tested without the Management API (scripts/supabase-advisors.test.mjs).
 *
 * `seen` maps each finding's `cache_key` to `{ name, level, detail }`; `accepted` is the set of
 * baseline keys. Returns the sorted key lists and the exit code the header's table defines.
 */
export function judge(seen, accepted) {
  const added = [...seen.keys()].filter((k) => !accepted.has(k)).sort();
  const cleared = [...accepted].filter((k) => !seen.has(k)).sort();
  const warnings = added.filter((k) => WARN_ONLY_CLASSES.has(seen.get(k).name));
  const failing = added.filter((k) => !WARN_ONLY_CLASSES.has(seen.get(k).name));
  // EVERY ACCEPTED FINDING CLEARING AT ONCE IS NOT GOOD NEWS: see the message in main().
  const comparedAgainstNothing = accepted.size > 0 && cleared.length === accepted.size;
  const exitCode = comparedAgainstNothing ? 3 : failing.length ? 1 : 0;
  return { added, failing, warnings, cleared, comparedAgainstNothing, exitCode };
}

/**
 * The project to ask about: an explicit `SUPABASE_PROJECT_REF`, otherwise the one the CLIENT is
 * built against, taken from `VITE_SUPABASE_URL`.
 *
 * Deliberately NOT `supabase/.temp/project-ref`: that is the Supabase CLI's LINK state. It is
 * per-checkout and untracked, so a worktree linked to a staging project would make this gate
 * quietly report on the wrong database - a confident wrong answer, which is worse than no answer.
 * scripts/migration-drift.mjs derives its ref the same way, for the same reason.
 */
const readProjectRef = () => {
  if (env.SUPABASE_PROJECT_REF) return env.SUPABASE_PROJECT_REF;
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(env.VITE_SUPABASE_URL || '');
  if (match) return match[1];
  throw new Error('no project ref: set SUPABASE_PROJECT_REF, or put VITE_SUPABASE_URL in .env');
};

/** The live fetch. Both advisor types; the endpoint is one per type. */
const fetchAdvisors = async () => {
  const token = env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    // "Could not check" is not "clean". Exit 2 so a caller can tell the two apart.
    console.error(
      'supabase-advisors: no SUPABASE_ACCESS_TOKEN in the environment or in .env, so nothing ' +
        'was checked.\n' +
        '  Create a personal access token at https://supabase.com/dashboard/account/tokens\n' +
        '  then add SUPABASE_ACCESS_TOKEN=<token> to .env, or re-run:\n' +
        '    SUPABASE_ACCESS_TOKEN=<token> node scripts/supabase-advisors.mjs',
    );
    process.exitCode = 2;
    return null;
  }
  const ref = readProjectRef();
  const out = [];
  // A REFUSED OR UNREACHABLE API IS EXIT 3, NOT A THROW - an uncaught throw exits 1, the code
  // that means "a new finding", and a five-minute outage would then red every landing until it
  // recovered. It still never reads as clean: the caller gets null, not an empty finding list.
  try {
    for (const type of ['security', 'performance']) {
      // A TIMEOUT, because the alternative is the job's own 15-minute cap. An API that accepts
      // the connection and then stalls would burn that cap between these two requests and end
      // the run `timed_out`, which ci-watch.mjs counts as red - a red landing for an upstream
      // outage, which is the exact outcome exit 3 exists to prevent. Aborting routes the same
      // event into exit 3, where it only warns.
      //
      // An explicit controller with a timer this CLEARS, not `AbortSignal.timeout()`, and not by
      // preference: that helper leaves a live libuv handle behind, and exiting while it closes
      // aborts the process on Windows. scripts/migration-drift.mjs hit it first and
      // scripts/db-push.mjs carries the same shape against the same API - 30 s is its
      // API_TIMEOUT_MS.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      let res;
      let body;
      try {
        res = await fetch(`https://api.supabase.com/v1/projects/${ref}/advisors/${type}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`advisors/${type} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
        body = await res.json();
      } finally {
        clearTimeout(timer);
      }
      // `lints` MUST BE AN ARRAY, and `?? []` used to let a reshaped 200 through as "no
      // findings". That was already this gate's silent-green path
      // (docs/metrics/2026-09-08-gates-that-measure-nothing.md); it became load-bearing the day
      // post-land started reading exit 0 as "this landing was checked". A body without the key
      // means the endpoint changed shape, which is the one thing that must never read as clean.
      if (!Array.isArray(body.lints)) {
        throw new Error(`advisors/${type} answered 200 with no \`lints\` array - the endpoint's shape changed, so nothing could be compared.`);
      }
      for (const lint of body.lints) out.push({ ...lint, advisorType: type });
    }
  } catch (err) {
    console.error(`supabase-advisors: could not reach the Management API, so nothing was checked.\n  ${err.message}`);
    process.exitCode = 3;
    return null;
  }
  return out;
};

/** A saved payload: either this script's own `--json` output, or raw `{lints:[...]}` objects. */
const readInput = (file) => {
  const parsed = JSON.parse(readFileSync(resolve(root, file), 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.lints)) return parsed.lints;
  if (Array.isArray(parsed.findings)) return parsed.findings;
  throw new Error(`${file}: expected an array, or an object with a lints/findings array`);
};

const recordBaseline = (seen) => {
  const entries = {};
  for (const key of [...seen.keys()].sort()) entries[key] = seen.get(key);
  writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        note:
          'Advisor findings seen and accepted. Regenerate with ' +
          '`node scripts/supabase-advisors.mjs --update-baseline`. Each entry is accepted because ' +
          'of its lint CLASS - the reasons live in ACCEPTED_CLASSES in that script. Re-recording ' +
          'accepts everything currently reported, so read the diff before committing one.',
        recordedAt: new Date().toISOString().slice(0, 10),
        count: Object.keys(entries).length,
        entries,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Recorded ${Object.keys(entries).length} accepted findings to supabase/advisor-baseline.json`);
};

const compareWithBaseline = (seen) => {
  if (!existsSync(BASELINE)) {
    console.error(
      'supabase-advisors: no baseline yet. Record one with:\n' +
        '  node scripts/supabase-advisors.mjs --update-baseline\n' +
        'Read the recorded file before committing it - it accepts everything currently reported.',
    );
    process.exitCode = 2;
    return;
  }
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  // THE KEY, NOT THE COUNT. An empty baseline is the state this project is trying to reach -
  // fix every standing advisory, re-record, and `entries` is legitimately `{}` - so refusing
  // a zero here would fail the gate for succeeding. What is never honest is `entries` having
  // been renamed away, which would silently compare every live finding against nothing.
  if (!baseline || typeof baseline.entries !== 'object' || baseline.entries === null) {
    throw new Error(`${BASELINE} has no \`entries\` object - the baseline's shape changed, and every live finding would read as new against nothing.`);
  }
  const accepted = new Set(Object.keys(baseline.entries));
  measured.optional(
    accepted.size,
    'accepted baseline findings',
    'zero is honest once every standing advisory has been fixed and the baseline re-recorded; the shape check above is what makes a zero here mean "clean" rather than "renamed away".',
  );
  const verdict = judge(seen, accepted);
  const { failing, warnings, cleared } = verdict;

  if (asJson) {
    const expand = (keys) => keys.map((k) => ({ key: k, ...seen.get(k) }));
    console.log(JSON.stringify({ total: seen.size, added: expand(failing), warnings: expand(warnings), cleared }, null, 2));
  } else {
    console.log(`${seen.size} advisor findings; ${accepted.size} accepted in the baseline.`);
    if (failing.length) {
      console.log('\nNEW since the baseline:');
      for (const key of failing) {
        const f = seen.get(key);
        console.log(`  - [${f.level}] ${f.name}`);
        console.log(`      ${f.detail}`);
        const why = ACCEPTED_CLASSES[f.name];
        // A new member of an accepted class is still new. Say what the class is accepted
        // FOR, so the reader can judge whether this occurrence is the same thing or a real
        // mistake wearing a familiar name.
        if (why) console.log(`      (this class is accepted because: ${why})`);
      }
    }
    // Printed, never failing: see WARN_ONLY_CLASSES for why this class carries no signal here.
    if (warnings.length) {
      console.log(`\nWarning, not failing (${warnings.length}): new since the baseline, in a class that never fails this check:`);
      for (const key of warnings) console.log(`  - [${seen.get(key).level}] ${seen.get(key).name}: ${seen.get(key).detail}`);
    }
    // A cleared finding is good news and must never fail the run - but it should be
    // re-recorded, or the baseline slowly becomes a list of things that no longer exist and
    // stops meaning "accepted".
    if (cleared.length) {
      console.log(`\nGone since the baseline (${cleared.length}) - re-record when convenient:`);
      for (const key of cleared) console.log(`  - ${key}`);
    }
    if (!verdict.added.length && !cleared.length) console.log('No change against the baseline.');
  }

  // EVERY ACCEPTED FINDING CLEARING AT ONCE IS NOT GOOD NEWS. A hundred-odd standing
  // advisories are not fixed by one landing, so the plausible causes are a payload this
  // script could not read properly and a baseline that no longer describes this project -
  // and a cleared finding never fails, by design, so without this the run exits 0 having
  // compared nothing. The report above still prints, because the list of what "cleared" is
  // what tells the reader which of the two it is.
  //
  // Exit 3, not 1: nobody should be sent hunting for a new finding that does not exist, and
  // post-land should not red a landing for something upstream most likely did.
  if (verdict.comparedAgainstNothing) {
    console.error(
      `\nsupabase-advisors: all ${accepted.size} accepted findings are absent from a report of ` +
        `${seen.size} - that is a comparison against the wrong data, not a clean project. ` +
        'Check the project ref and the payload before re-recording anything.',
    );
  }
  process.exitCode = verdict.exitCode;
};

// EXIT 2 FOR ANY UNEXPECTED ERROR, never the uncaught throw's 1: a mangled baseline, an
// unconfigured project ref or a bug in this file would otherwise send somebody hunting for a new
// advisor finding that does not exist. The exit-code table in the header says what each means.
const main = async () => {
  try {
    const lints = inputArg ? readInput(inputArg) : await fetchAdvisors();
    // null: fetchAdvisors already explained itself and set the exit code.
    if (lints === null) return;
    // `cache_key` is the advisors' own stable identity for a finding - it survives rewording of
    // the human-facing detail, which a hash of the message would not.
    const seen = new Map();
    for (const l of lints) seen.set(l.cache_key, { name: l.name, level: l.level, detail: l.detail });
    measured.optional(
      seen.size,
      'advisor findings',
      'A project the advisors have nothing to say about reports zero, and that is the answer this ' +
        'check hopes for rather than a sign it stopped looking. The baseline count below is the ' +
        'report that would notice a comparison against nothing.',
    );
    if (updating) recordBaseline(seen);
    else compareWithBaseline(seen);
  } catch (err) {
    console.error(`supabase-advisors: ${err.message}`);
    process.exitCode = 2;
  }
};

// Only run when invoked directly - the test imports `judge` from this same file.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
