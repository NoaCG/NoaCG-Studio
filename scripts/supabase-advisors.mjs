// gate: none - reads the live Supabase project with credentials no runner holds
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
// keys (the CLI's own login is stored elsewhere and is deliberately not read here). That is why
// this is NOT part of .github/workflows/weekly-audit.yml, which is secret-free on purpose - see
// docs/STACK_FRESHNESS.md.
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
    'cannot ask - accepted here as reachability, not as a judgement about volume.',
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
  for (const type of ['security', 'performance']) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/advisors/${type}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`advisors/${type} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    for (const lint of body.lints ?? []) out.push({ ...lint, advisorType: type });
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

const lints = inputArg ? readInput(inputArg) : await fetchAdvisors();
if (lints === null) {
  // fetchAdvisors already explained itself and set the exit code.
} else {
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

  if (updating) {
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
  } else {
    if (!existsSync(BASELINE)) {
      console.error(
        'supabase-advisors: no baseline yet. Record one with:\n' +
          '  node scripts/supabase-advisors.mjs --update-baseline\n' +
          'Read the recorded file before committing it - it accepts everything currently reported.',
      );
      process.exitCode = 2;
    } else {
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
      const added = [...seen.keys()].filter((k) => !accepted.has(k)).sort();
      const cleared = [...accepted].filter((k) => !seen.has(k)).sort();

      if (asJson) {
        console.log(JSON.stringify({ total: seen.size, added: added.map((k) => ({ key: k, ...seen.get(k) })), cleared }, null, 2));
      } else {
        console.log(`${seen.size} advisor findings; ${accepted.size} accepted in the baseline.`);
        if (added.length) {
          console.log('\nNEW since the baseline:');
          for (const key of added) {
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
        // A cleared finding is good news and must never fail the run - but it should be
        // re-recorded, or the baseline slowly becomes a list of things that no longer exist and
        // stops meaning "accepted".
        if (cleared.length) {
          console.log(`\nGone since the baseline (${cleared.length}) - re-record when convenient:`);
          for (const key of cleared) console.log(`  - ${key}`);
        }
        if (!added.length && !cleared.length) console.log('No change against the baseline.');
      }
      process.exitCode = added.length ? 1 : 0;
    }
  }
}
