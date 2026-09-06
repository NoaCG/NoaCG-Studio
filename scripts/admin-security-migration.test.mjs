// guards: supabase/migrations/**
//
// Pins the authorization posture of the admin/suspension predicates so a later edit cannot
// quietly reopen arbitrary-user probing. Static assertions over the migration text, in the same
// spirit as ai-lite-migration.test.mjs: they run offline, in every checkout, with no database.
//
// The behavioural half of this proof lives INSIDE 0020 as a self-check that impersonates an
// ordinary authenticated caller and aborts the migration unless the lockdown actually holds.
// These tests guard the source; that block guards every instance it is applied to. Neither one
// is sufficient alone - text can drift from behaviour, and a self-check nobody reads can be
// deleted in a diff that looks like cleanup.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const dir = new URL('../supabase/migrations/', import.meta.url);
const read = (file) => readFile(new URL(file, dir), 'utf8');

// Every migration, discovered rather than listed - the session-role rule below applies to all of
// them, including the one that has not been written yet.
const migrationFiles = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
const allMigrations = new Map(
  await Promise.all(migrationFiles.map(async (f) => [f, await read(f)])),
);

const entitlements = await read('0018_entitlements.sql');
const selfScoped = await read('0020_self_scoped_predicates.sql');
const oneActiveGrant = await read('0021_one_active_grant.sql');
const absolutes = await read('0022_entitlement_absolutes.sql');
const temporaryDeny = await read('0023_temporary_deny_absolute.sql');
const overview = await read('0024_admin_overview.sql');
const renderMetrics = await read('0026_overview_outcome_metrics.sql');

test('the suspension predicate takes no argument, so there is nothing to point at another user', () => {
  assert.match(
    selfScoped,
    /create or replace function public\.is_suspended\(\)\s*\nreturns boolean/i,
    'expected a zero-argument public.is_suspended()',
  );
  // It must resolve the subject itself rather than accepting one.
  assert.match(selfScoped, /where a\.user_id = \(select auth\.uid\(\)\) and a\.state = 'suspended'/i);
  // And the old probe must actually be removed, not merely left ungranted.
  assert.match(selfScoped, /drop function if exists public\.is_suspended\(uuid\)/i);
});

test('no policy passes a user id into is_suspended', () => {
  // 0018 wrote `is_suspended((select auth.uid()))`. Every policy 0020 creates must instead call
  // the zero-arg form. Scoped to the CREATE POLICY statements: the file legitimately names the
  // old signature elsewhere (the drop, the header comment, and the self-check that probes for it).
  const policies = [...selfScoped.matchAll(/create policy "[^"]+"[\s\S]*?;/gi)].map((m) => m[0]);
  assert.ok(policies.length >= 9, `expected at least 9 policies, found ${policies.length}`);
  for (const policy of policies) {
    const name = policy.match(/create policy "([^"]+)"/i)[1];
    const calls = policy.match(/is_suspended\([^)]*\)/gi) ?? [];
    assert.ok(calls.length > 0, `${name} no longer gates on is_suspended at all`);
    for (const call of calls) {
      assert.equal(
        call.toLowerCase(),
        'is_suspended()',
        `${name} passes an argument to is_suspended (${call}) - that is the probe being removed`,
      );
    }
  }
});

test('authenticated KEEPS execute on the zero-arg predicate - the policies cannot work without it', () => {
  // A policy expression is evaluated with the QUERYING role's privileges, so revoking this grant
  // would make every signed-in write fail with 42501 instead of simply being allowed through.
  // Verified against a live database; see the comment header in 0020.
  assert.match(selfScoped, /grant execute on function public\.is_suspended\(\) to authenticated/i);
  assert.match(selfScoped, /revoke execute on function public\.is_suspended\(\) from public, anon/i);
});

test('every suspension policy from 0018 is recreated, none silently dropped', () => {
  const policyNames = [...entitlements.matchAll(/create policy "([a-z_]*not_suspended[a-z_]*)"/gi)]
    .map((match) => match[1]);
  assert.equal(policyNames.length, 9, 'expected 0018 to define nine suspension policies');
  for (const name of policyNames) {
    assert.match(
      selfScoped,
      new RegExp(`create policy "${name}"`, 'i'),
      `0020 drops ${name} without recreating it - that write path would lose its suspension gate`,
    );
  }
});

test('probing another account is admin-only and refuses before reading anything', () => {
  const body = selfScoped.match(
    /create or replace function public\.admin_user_suspended\(p_user uuid\)[\s\S]*?\$\$;/i,
  );
  assert.ok(body, 'expected an admin_user_suspended(uuid) function');
  const source = body[0];
  assert.match(source, /security definer/i);
  assert.match(source, /set search_path = ''/i);

  const guardAt = source.search(/if not public\.is_admin\('support'\) then/i);
  const readAt = source.search(/from public\.user_accounts/i);
  assert.notEqual(guardAt, -1, 'the function must verify the caller is an admin');
  assert.notEqual(readAt, -1);
  assert.ok(guardAt < readAt, 'the admin check must come BEFORE the table read');
  assert.match(source, /raise exception[\s\S]*?errcode = '42501'/i);

  assert.match(
    selfScoped,
    /revoke execute on function public\.admin_user_suspended\(uuid\) from public, anon/i,
  );
});

test('the unused admin predicates are off the REST surface', () => {
  assert.match(selfScoped, /revoke execute on function public\.is_admin\(text\) from authenticated/i);
  assert.match(
    selfScoped,
    /revoke execute on function public\.admin_role_rank\(text\) from authenticated/i,
  );
});

test('0020 refuses to apply unless the lockdown demonstrably holds', () => {
  // Each branch below was mutation-tested against the live schema: removing the corresponding
  // statement makes the matching check fire. Losing any of them turns the migration into a
  // change that only claims to have closed the hole.
  for (const check of ['(a)', '(b)', '(c)', '(d)']) {
    assert.ok(
      selfScoped.includes(`0020 self-check ${check} FAILED`),
      `0020 lost its self-check ${check}`,
    );
  }
  // It must read the real ACL, not just re-read its own SQL.
  assert.match(selfScoped, /has_function_privilege\('authenticated', 'public\.is_suspended\(\)'/i);
  assert.match(selfScoped, /has_function_privilege\('authenticated', 'public\.is_admin\(text\)'/i);
  assert.match(selfScoped, /to_regprocedure\('public\.is_suspended\(uuid\)'\)/i);
});

test('no migration hands back a different role than it was given', () => {
  // `supabase db push` connects as an unprivileged cli_login_postgres and elevates with
  // SET SESSION ROLE postgres. A RESET ROLE (or a bare SET ROLE) inside a migration drops the
  // session back down, and the CLI then fails to write supabase_migrations.schema_migrations -
  // rolling the whole migration back on an error that looks unrelated. Cost one failed apply.
  // Comments are stripped first: 0020 documents this trap at length, and the write-up naming
  // RESET ROLE must not read as the statement itself.
  //
  // The danger is landing on the WRONG role when the statement after the migration runs, so that -
  // not the SET itself - is what this checks. RESET ROLE and SET SESSION ROLE are banned outright:
  // both are permanent and neither can be undone without knowing what was there. `SET LOCAL ROLE`
  // is allowed only where the file captured `current_role` first and sets it back by name, which
  // is the only way a self-check can act as a CLIENT role (0042 has to insert as `authenticated`
  // to prove a trigger still fires for a role holding no EXECUTE). Cost a second failed apply:
  // RESET ROLE looked like the way home from a SET LOCAL ROLE, and it is not - it lands on
  // session_user, the login role, which holds no grants on anything.
  const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');
  // SELF-DISCOVERING, and that is the point: this trap belongs to every migration, not to the
  // two that happened to exist when it was found. A hardcoded list silently stops covering the
  // next file somebody adds, which is exactly when the lesson has been forgotten.
  assert.ok(migrationFiles.length >= 21, `expected the full migration set, found ${migrationFiles.length}`);
  for (const name of migrationFiles) {
    const code = stripComments(allMigrations.get(name));
    assert.doesNotMatch(code, /\breset\s+role\b/i, `${name} resets the session role`);
    assert.doesNotMatch(code, /\bset\s+session\s+role\b/i, `${name} sets the session role`);

    // Everything below is about SET LOCAL ROLE, which is conditional rather than banned.
    const switches = code.match(/\bset\s+local\s+role\s+(?!%I\b)/gi) ?? [];
    const restores = code.match(/\bset\s+local\s+role\s+%I['"]\s*,\s*\w+/gi) ?? [];
    const bareSet = code.match(/\bset\s+role\b/gi) ?? [];
    assert.equal(bareSet.length, 0, `${name} uses a bare SET ROLE; only SET LOCAL ROLE is undoable`);
    if (switches.length === 0) {
      assert.equal(restores.length, 0, `${name} restores a role it never changed`);
      continue;
    }
    assert.match(
      code,
      /:=\s*current_role\b/i,
      `${name} changes role without capturing current_role, so it cannot put it back`,
    );
    // Strictly greater, not >=: every switch away needs its own way back AND the exception
    // handler needs one, because a self-check that raises must not leave the role changed for
    // whatever the CLI runs next. A count that merely balances is the shape of a file that
    // restores on the happy path only.
    assert.ok(
      restores.length > switches.length,
      `${name} changes role ${switches.length}x and restores it ${restores.length}x - the ` +
        'exception path needs a restore of its own',
    );
  }
});

// ── 0021: one active grant per (user, kind, key) ─────────────────────────────────────────────

test('the ambiguous grant state is made unreachable, not merely discouraged', () => {
  // UNIQUE, or two active rows can still name one key. PARTIAL, or revoked history - which the
  // revoke-by-stamp design depends on - becomes impossible to accumulate.
  assert.match(
    oneActiveGrant,
    /create unique index if not exists user_grants_one_active_idx\s*\n\s*on public\.user_grants \(user_id, kind, key\)\s*\n\s*where revoked_at is null/i,
    'expected a PARTIAL UNIQUE index over the active rows',
  );
});

test('existing duplicates are resolved before the index is created, newest kept', () => {
  // A unique index cannot be built over data that already violates it, so a database that
  // already carries a pair must be repaired in the same migration or the apply just fails.
  const repair = oneActiveGrant.slice(0, oneActiveGrant.indexOf('create unique index'));
  assert.match(repair, /update public\.user_grants/i, 'nothing repairs pre-existing duplicates');
  assert.match(repair, /order by created_at desc/i, 'the newest active grant must be the one kept');
  assert.match(repair, /set revoked_at = now\(\)/i, 'losers must be revoked, matching the API');
  assert.doesNotMatch(repair, /delete\s+from\s+public\.user_grants/i, 'history is stamped, never deleted');
});

test('0022 gates are RESTRICTIVE, never permissive', () => {
  // A permissive policy of the same name would be worse than no policy at all: permissive
  // policies are ORed together, so it would WIDEN access rather than narrow it.
  const policies = [...absolutes.matchAll(/create policy "[^"]+"[\s\S]*?;/gi)].map((m) => m[0]);
  assert.equal(policies.length, 8, `expected 8 gates, found ${policies.length}`);
  for (const policy of policies) {
    const name = policy.match(/create policy "([^"]+)"/i)[1];
    assert.match(policy, /as restrictive/i, `${name} is not restrictive`);
    assert.match(policy, /for (insert|update) to authenticated/i, `${name} gates the wrong command`);
    assert.match(policy, /public\.feature_denied\('/i, `${name} does not consult the predicate`);
  }
});

test('0022 leaves reads and deletes alone', () => {
  // Stated in 0018 and repeated here because it is the difference between an entitlement and a
  // confiscation: a denied account keeps reading and exporting its own work, and unpublishing or
  // closing a show down must never be the thing that gets blocked.
  const policies = absolutes.match(/create policy "[^"]+"[\s\S]*?;/gi)?.join('\n') ?? '';
  assert.doesNotMatch(policies, /\bfor select\b/i, '0022 gates a read path');
  assert.doesNotMatch(policies, /\bfor delete\b/i, '0022 blocks a delete');
  assert.doesNotMatch(policies, /\bfor all\b/i, '0022 gates every command at once');
});

test('no policy passes a user id into the entitlement predicate', () => {
  // The same rule 0020 established for is_suspended: a policy must call the SELF-SCOPED form.
  // The cross-user form exists for the capability RPCs, where the subject is the show's owner
  // rather than the caller - a policy naming it would be a probe with a user id in it.
  const policies = [...absolutes.matchAll(/create policy "[^"]+"[\s\S]*?;/gi)].map((m) => m[0]);
  for (const policy of policies) {
    const name = policy.match(/create policy "([^"]+)"/i)[1];
    assert.doesNotMatch(policy, /feature_denied_for\(/i, `${name} names the cross-user predicate`);
  }
});

test('the cross-user predicate is off the REST surface, the self-scoped one is granted', () => {
  // PostgREST publishes every function a client role may execute. feature_denied_for takes a user
  // id, so granting it would recreate exactly the probe 0020 spent a migration removing - while
  // feature_denied MUST stay granted, or every policy above fails 42501 instead of allowing.
  assert.match(
    absolutes,
    /revoke execute on function public\.feature_denied_for\(uuid, text\) from public, anon, authenticated/i,
  );
  assert.doesNotMatch(
    absolutes,
    /grant execute on function public\.feature_denied_for\(uuid, text\)/i,
    'the cross-user predicate is granted to something - it should be reachable only from definer functions',
  );
  assert.match(absolutes, /grant execute on function public\.feature_denied\(text\) to authenticated/i);
  assert.match(absolutes, /revoke execute on function public\.feature_denied\(text\) from public, anon/i);
});

test('the predicate mirrors the contract instead of re-deciding precedence', () => {
  const body = absolutes.match(
    /create or replace function public\.feature_denied_for\(p_user uuid, p_key text\)[\s\S]*?\$\$;/i,
  );
  assert.ok(body, 'expected a feature_denied_for(uuid, text) function');
  const source = body[0];
  assert.match(source, /security definer/i);
  assert.match(source, /set search_path = ''/i);
  // The three absolutes, and only them.
  assert.match(source, /state = 'suspended'/i, 'suspension is not one of the absolutes');
  assert.match(source, /key = 'disabled_features'/i, 'the kill switch is not one of the absolutes');
  assert.match(source, /g\.expires_at is null/i, 'a temporary grant would be read as an override');
  // grantActive(): revoked beats everything, a future start has not begun.
  assert.match(source, /g\.revoked_at is null/i);
  assert.match(source, /g\.starts_at is null or g\.starts_at <= now\(\)/i);
  // toGrant() drops a malformed payload rather than guessing, so a malformed row must not deny.
  assert.match(source, /jsonb_typeof\(g\.value -> 'value'\) = 'boolean'/i);
  // Precedence must NOT appear: no plan, no assignment, no ranking of one row against another.
  assert.doesNotMatch(source, /public\.plans|public\.user_plans/i, 'the predicate reads plan rows');
});

test('the capability RPCs refuse before they write', () => {
  // These are the paths an anonymous holder of the slug reaches, so they are where showchat and
  // control.hosted actually cost something. A check after the INSERT would log the command it
  // was meant to refuse.
  for (const fn of ['control_send', 'control_stage', 'control_report']) {
    const body = absolutes.match(new RegExp(`create or replace function public\\.${fn}\\([\\s\\S]*?\\$\\$;`, 'i'));
    assert.ok(body, `0022 no longer redefines ${fn}`);
    const source = body[0];
    const guardAt = source.search(/feature_denied_for\(v_owner, 'control\.hosted'\)/i);
    const writeAt = source.search(/insert into public\.control_events|update public\.control_shows/i);
    assert.notEqual(guardAt, -1, `${fn} does not check the show owner's entitlement`);
    assert.notEqual(writeAt, -1);
    assert.ok(guardAt < writeAt, `${fn} checks the entitlement only after writing`);
  }
  // The audience door: a denied owner's show must read as not accepting submissions, which is
  // what the anonymous insert policy from 0003 already gates on.
  const accepts = absolutes.match(/create or replace function public\.show_accepts\(p_show uuid\)[\s\S]*?\$\$;/i);
  assert.ok(accepts, 'show_accepts is no longer gated');
  assert.match(accepts[0], /s\.is_open/i, 'show_accepts lost its is_open check');
  assert.match(accepts[0], /feature_denied_for\(s\.owner_id, 'showchat'\)/i);
  // The page must be told the same thing the insert policy will enforce, or it renders an open
  // form and the visitor meets a raw row-level security error instead of "submissions are closed".
  const bySlug = absolutes.match(/create or replace function public\.show_by_slug\(p_slug text\)[\s\S]*?\$\$;/i);
  assert.ok(bySlug, 'show_by_slug still reports is_open without the owner gate');
  assert.match(bySlug[0], /feature_denied_for\(s\.owner_id, 'showchat'\)/i);
});

test('0022 refuses to apply unless the gates demonstrably hold', () => {
  for (const check of ['(a)', '(b)', '(c)', '(d)']) {
    assert.ok(absolutes.includes(`0022 self-check ${check} FAILED`), `0022 lost its self-check ${check}`);
  }
  // Read the real ACL and the real catalog, not the migration's own text.
  assert.match(absolutes, /has_function_privilege\('authenticated', 'public\.feature_denied\(text\)'/i);
  assert.match(absolutes, /has_function_privilege\('anon', 'public\.feature_denied_for\(uuid, text\)'/i);
  assert.match(absolutes, /from pg_policies/i, 'the gates are not verified against the catalog');
  assert.match(absolutes, /permissive = 'RESTRICTIVE'/i, 'restrictiveness is not verified');
  // And prove the predicate actually denies, rather than only that it exists.
  assert.match(absolutes, /public\.feature_denied\('showchat'\) into denied/i);
});

// ── 0023: a temporary denying grant joins the absolutes ──────────────────────────────────────

test('the grant test covers both shapes and keeps every date rule', () => {
  const body = temporaryDeny.match(
    /create or replace function public\.feature_denied_for\(p_user uuid, p_key text\)[\s\S]*?\$\$;/i,
  );
  assert.ok(body, '0023 no longer redefines the predicate');
  const source = body[0];
  // The two shapes in one condition: null expiry is the permanent override, a live expiry is the
  // temporary grant that 0021's uniqueness makes decisive.
  assert.match(source, /g\.expires_at is null or g\.expires_at > now\(\)/i);
  // The other three rules from grantActive() must survive the rewrite - each of them is what
  // stops a stale or malformed row from taking access away.
  assert.match(source, /g\.revoked_at is null/i, 'a revoked grant would still deny');
  assert.match(source, /g\.starts_at is null or g\.starts_at <= now\(\)/i, 'a future grant would deny early');
  assert.match(source, /jsonb_typeof\(g\.value -> 'value'\) = 'boolean'/i, 'a malformed payload could deny');
  assert.match(source, /\(g\.value ->> 'value'\) = 'false'/i, 'an ALLOW grant would read as a denial');
  // And the other two absolutes must still be there - this migration only widens the grant test.
  assert.match(source, /state = 'suspended'/i);
  assert.match(source, /key = 'disabled_features'/i);
  // Still no precedence: no plan, no assignment, no ranking of one row against another.
  assert.doesNotMatch(source, /public\.plans|public\.user_plans/i);
});

test('no gate is pointed at an ai.* key, where the subset property does not hold', () => {
  // AI_LITE_OVERRIDE_USER_IDS widens a false back to true for `ai.` keys only (contract.ts,
  // the envOverride branch), so on such a key the contract can ALLOW where this predicate denies
  // - the one direction the whole design forbids. The AI keys are gated at their endpoints and
  // no policy names one; this test is what keeps that a deliberate decision.
  for (const [name, sql] of [['0022', absolutes], ['0023', temporaryDeny]]) {
    for (const call of sql.matchAll(/feature_denied(?:_for)?\((?:[^,)]+,\s*)?'([^']+)'\)/gi)) {
      assert.doesNotMatch(
        call[1],
        /^ai\./,
        `${name} gates ${call[1]}, an ai.* key the env override can widen back`,
      );
    }
  }
});

test('0023 proves the branch it adds, on a real row, and cleans up after itself', () => {
  for (const check of ['(a)', '(b)', '(c)', '(d)']) {
    assert.ok(temporaryDeny.includes(`0023 self-check ${check} FAILED`), `0023 lost its self-check ${check}`);
  }
  // The point of this self-check is that it can do what 0022's could not: exercise the grant
  // branch against a real user_grants row, since the column references auth.users.
  assert.match(temporaryDeny, /insert into public\.user_grants/i, 'the grant branch is never exercised');
  assert.match(temporaryDeny, /'__selfcheck__'/, 'the probe key must not be a real FeatureKey');
  assert.match(temporaryDeny, /delete from public\.user_grants where user_id = v_user and key = '__selfcheck__'/i,
    'the scaffolding row is left behind');
  // An instance with no accounts must still apply.
  assert.match(temporaryDeny, /from auth\.users order by created_at limit 1/i);
  assert.match(temporaryDeny, /skipping the behavioural half/i, 'an empty auth.users would fail the apply');
  // And the ACL must be re-asserted: CREATE OR REPLACE preserving it is the assumption this
  // migration rests on, so it is checked rather than trusted.
  assert.match(temporaryDeny, /has_function_privilege\('authenticated', 'public\.feature_denied_for\(uuid, text\)'/i);
  assert.match(temporaryDeny, /has_function_privilege\('authenticated', 'public\.feature_denied\(text\)'/i);
});

test('0021 refuses to apply unless the constraint demonstrably holds', () => {
  // Same posture as 0020: assert against the live catalog, raise on failure so the whole
  // migration rolls back. Reading pg_index rather than trusting the CREATE's own text.
  assert.match(oneActiveGrant, /do \$\$/i, 'no self-check block');
  assert.match(oneActiveGrant, /from pg_index i/i, 'the index is not verified against the catalog');
  assert.match(oneActiveGrant, /i\.indisunique/i, 'uniqueness is not verified');
  assert.match(oneActiveGrant, /i\.indpred is not null/i, 'partialness is not verified');
  assert.match(oneActiveGrant, /raise exception '0021 self-check \(a\)/i);
  assert.match(oneActiveGrant, /raise exception '0021 self-check \(b\)/i);
});

test('the overview aggregation is unreachable from a client role', () => {
  // These three read auth.users, the funnel ledger and every AI/render ledger, so they are the
  // most disclosive functions in the schema. PostgREST publishes any function a client role may
  // execute as /rest/v1/rpc/<name>, which would make them both a data leak and confirmation that
  // an admin system exists - the two things docs/ADMIN.md §1 exists to prevent. They are reached
  // only with the service key, from behind requireAdmin.
  const signatures = [
    'admin_overview_window(timestamptz, timestamptz)',
    'admin_overview_state()',
    'admin_overview_mix(timestamptz, timestamptz)',
  ];
  for (const signature of signatures) {
    const name = signature.slice(0, signature.indexOf('('));
    assert.match(
      overview,
      new RegExp(`create or replace function public\\.${name}\\b`, 'i'),
      `${name} is not defined`,
    );
    assert.match(
      overview,
      new RegExp(`revoke all on function public\\.${escapeForRegExp(signature)} from public, anon, authenticated`, 'i'),
      `${name} is not revoked from the client roles`,
    );
    assert.match(
      overview,
      new RegExp(`grant execute on function public\\.${escapeForRegExp(signature)} to service_role`, 'i'),
      `${name} is not granted to service_role`,
    );
    // SECURITY DEFINER without a pinned search_path is the classic privilege-escalation shape.
    assert.doesNotMatch(overview, new RegExp(`${name}[\\s\\S]{0,4000}?language sql\\s*\\n(?!security definer)`, 'i'));
  }

  // Three definer functions, three pinned search paths, and no writes anywhere: this migration
  // may only ever read. Counted over the CODE, since the header explains both in prose.
  const code = overview.replace(/--[^\n]*/g, '');
  assert.equal((code.match(/security definer/gi) ?? []).length, 3);
  assert.equal((code.match(/set search_path = ''/g) ?? []).length, 3);
  for (const verb of ['insert into', 'update ', 'delete from', 'drop table', 'alter table']) {
    assert.doesNotMatch(code, new RegExp(`\\b${verb}`, 'i'), `0024 must not ${verb.trim()}`);
  }

  // And it proves the lockdown rather than asserting it in a comment.
  assert.match(overview, /do \$\$/i, 'no self-check block');
  assert.match(overview, /must not be executable by a client role/i);
});

test('every migration that (re)defines an overview function re-locks it, not just 0024', () => {
  // The rule generalizes because the risk does. A DROP discards the function's ACL, and a
  // recreated function is PUBLIC-executable by default - so a later migration that reshapes one
  // of these and forgets the revoke would silently publish the instance's whole activity ledger
  // at /rest/v1/rpc/<name>. 0026 is the first such migration; this discovers any future one
  // rather than naming them, so the guard cannot go stale by omission.
  let checked = 0;
  for (const [name, sql] of allMigrations) {
    // `or replace` is OPTIONAL in the pattern, and that is the point. A migration whose
    // SIGNATURE changes cannot use `create or replace` at all - Postgres refuses to replace a
    // function whose argument list differs - so it must DROP and plain-CREATE, which is exactly
    // the case that discards the ACL. Matching only the `or replace` spelling would have let
    // 0027's three re-created functions past this guard while it reported a pass.
    for (const match of sql.matchAll(/create (?:or replace )?function public\.(admin_overview_\w+)\s*\(([^)]*)\)/gi)) {
      const fn = match[1];
      // The signature as the GRANT statements have to spell it: parameter types only.
      const types = match[2]
        .split(',')
        .map((part) => part.trim().split(/\s+/).slice(1).join(' ').trim())
        .filter(Boolean)
        .join(', ');
      const signature = `public.${fn}(${types})`;
      assert.match(
        sql,
        new RegExp(`revoke all on function ${escapeForRegExp(signature)} from public, anon, authenticated`, 'i'),
        `${name} defines ${fn} without revoking it from the client roles`,
      );
      assert.match(
        sql,
        new RegExp(`grant execute on function ${escapeForRegExp(signature)} to service_role`, 'i'),
        `${name} defines ${fn} without granting it to service_role`,
      );
      checked++;
    }
  }
  // Vacuous-guard tripwire: 0024 alone defines three, so anything under four means the matcher
  // stopped finding what it is supposed to be checking.
  assert.ok(checked >= 4, `expected at least 4 overview function definitions, found ${checked}`);
});

test('0026 stops counting a working guardrail as a failure, and a reservation as spend', () => {
  // The AI half of the same shape the render columns had: `unsupported` is Lite REFUSING a brief
  // outside its scope, which is the product behaving as designed. Folding it into the failure
  // count is what made 26 "failures" out of 19 real ones.
  const code = renderMetrics.replace(/--[^\n]*/g, '');
  assert.match(code, /ai_declined bigint/i, 'the declined column is missing');
  assert.match(code, /g\.status = 'unsupported'/i, 'declined is not counted from unsupported');
  assert.doesNotMatch(
    code,
    /status in \('failed', 'unsupported', 'expired'\)/i,
    'unsupported is still being counted as an AI failure',
  );
  assert.match(code, /g\.status = 'failed'\s*\n?\s*and g\.created_at/i, 'ai_failures is not narrowed to failed');

  // And spend must exclude rows that never reached a provider - those still carry the
  // reservation's ceiling, which is booked up front for the fleet-budget check.
  const spend = code.match(/select coalesce\(sum\(g\.provider_cost_usd\), 0\)[\s\S]{0,200}?\)/i);
  assert.ok(spend, 'the Lite spend aggregate is missing');
  assert.match(spend[0], /g\.model is not null/i, 'spend still counts generations that never ran');
});

test('0026 corrects the render states rather than re-stating the bug', () => {
  // The whole point of the migration: `expired` is a DELIVERED render whose file aged out, so it
  // must not appear in the failed count, and the delivered count must include it - otherwise the
  // figure decays to zero as outputs expire. Asserted on the SQL because there is no database in
  // CI; the behavioural half is the migration's own DO block, which compares the function's
  // answer against render_jobs directly and aborts the apply on a mismatch.
  const code = renderMetrics.replace(/--[^\n]*/g, '');
  assert.match(code, /renders_delivered bigint/i, 'the delivered column is missing');
  assert.doesNotMatch(code, /renders_completed/i, 'the transient `complete` column is still there');

  const failed = code.match(/j\.status = 'failed' and j\.created_at/i);
  assert.ok(failed, 'the failed count is not narrowed to status = failed');
  assert.doesNotMatch(
    code,
    /status in \('failed', 'expired'\)/i,
    'expired is still being counted as a failure',
  );
  assert.match(code, /status in \('complete', 'expired'\)/i, 'delivered does not include expired');

  // A DROP discards the ACL, so this migration must re-assert it - the generic test above
  // enforces that, and this one pins that the drop is actually what it does.
  assert.match(code, /drop function if exists public\.admin_overview_window\(timestamptz, timestamptz\)/i);
  assert.match(renderMetrics, /do \$\$/i, 'no self-check block');
});

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── append-only is a REVOKE, never a comment ─────────────────────────────────────────────
//
// Not hypothetical: `0017` headed its table `admin_audit_log: append-only by PRIVILEGE, not by
// convention` and wrote `grant select, insert ... to service_role` underneath it. That reads
// like a restriction and is not one - Supabase configures `alter default privileges in schema
// public grant all on tables to service_role`, so the table was created holding DELETE, UPDATE
// and TRUNCATE, and a narrower grant adds nothing on top of privileges already there. Measured
// on production thirteen migrations later, all three were still granted. `0030` is the repair.
//
// THE OBLIGATION IS SET-WIDE, not per-migration: one migration may make the claim and a later
// one deliver it, which is exactly what 0017 and 0030 do. Requiring the claiming migration to
// carry its own revoke would mean rewriting applied history to satisfy a test.
//
// SCOPED TO SERVICE-ROLE TABLES, because that is the only class where the defect can exist. A
// table whose writes are gated by RLS can be append-only with its grants left wide -
// `control_events` (0008) is exactly that: RLS on, a single SELECT-only policy, writes only
// through SECURITY DEFINER RPCs, so no client can rewrite the command log whatever the table
// grants say. This test flagged it on an earlier draft and that was a FALSE POSITIVE. A table
// handed to `service_role` has no such backstop - the service key bypasses RLS, so there the
// grant IS the gate.
test('every table called append-only is one service_role cannot rewrite', () => {
  // A claim binds to the table named ON ITS OWN LINE. Prose that mentions the concept without
  // naming a table ("an append-only record of what they did") promises nothing checkable, and
  // a cross-reference to another migration's table is not a claim about this one's.
  const claimed = new Set();
  for (const sql of allMigrations.values()) {
    for (const line of sql.split(/\r?\n/)) {
      if (!/append-only/i.test(line)) continue;
      for (const [, table] of line.matchAll(/(?:public\.)?\b([a-z][a-z0-9_]{3,})\b(?=\s*:)/g)) {
        claimed.add(table);
      }
    }
  }
  assert.ok(claimed.has('admin_audit_log'), 'expected the audit log to still claim append-only');

  const everything = [...allMigrations.entries()];
  for (const table of claimed) {
    // Only binding once some migration hands the table to service_role - see the header.
    // String.raw, not a plain template literal. `\s` in a template literal is just `s` - the
    // first draft of this test built `grants+[a-z, ]+?s+ons+table...`, matched nothing, and
    // therefore PASSED while asserting nothing at all. Only mutation-testing it found that.
    const handed = everything.some(([, sql]) =>
      new RegExp(String.raw`grant\s+[a-z, ]+?\s+on\s+table\s+public\.${escapeForRegExp(table)}\s+to\s+service_role`, 'i').test(sql));
    if (!handed) continue;

    const revoke = new RegExp(
      String.raw`revoke\s+([a-z, ]+?)\s+on\s+table\s+public\.${escapeForRegExp(table)}\s+from\s+service_role`, 'i');
    const source = everything.find(([, sql]) => revoke.test(sql));
    assert.ok(
      source,
      `${table} is called append-only and handed to service_role, but no migration revokes `
      + 'anything from it - a grant-only line withholds nothing against the platform defaults',
    );
    const [name, sql] = source;
    const privileges = sql.match(revoke)[1].toLowerCase();
    for (const privilege of ['update', 'delete', 'truncate']) {
      assert.ok(
        privileges.includes(privilege),
        `${name} revokes on ${table} but leaves ${privilege} - that is not append-only`,
      );
    }
    // And it must say so to the DATABASE, not only to the reader. A revoke with nothing checking
    // it is how the original claim survived thirteen migrations: nothing ever looked.
    assert.match(
      sql,
      new RegExp(
        String.raw`has_table_privilege\([^)]*service_role[^)]*${escapeForRegExp(table)}[^)]*'(update|delete|truncate)'\)`, 'i'),
      `${name} revokes on ${table} without asserting the result in a DO block`,
    );
  }
});
