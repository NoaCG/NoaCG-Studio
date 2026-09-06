// guards: supabase/migrations/**

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/0010_ai_generations.sql', import.meta.url);
const sql = await readFile(migrationUrl, 'utf8');
const qualityMigrationUrl = new URL('../supabase/migrations/0011_ai_lite_quality_feedback.sql', import.meta.url);
const qualitySql = await readFile(qualityMigrationUrl, 'utf8');

test('Lite accounting migration is content-free and inaccessible to browser roles', () => {
  assert.match(sql, /alter table public\.ai_generations enable row level security/i);
  assert.match(
    sql,
    /revoke all on table public\.ai_generations from public, anon, authenticated/i,
  );
  assert.doesNotMatch(sql, /create policy/i);
  assert.doesNotMatch(
    sql,
    /\b(prompt|conversation|design_spec|template|generated_code|provider_response|raw_ip)\b/i,
  );
});

test('Lite quota RPCs fail closed to service-role-only execution', () => {
  assert.equal((sql.match(/security definer/gi) ?? []).length, 2);
  assert.equal((sql.match(/set search_path = ''/gi) ?? []).length, 3);
  assert.match(
    sql,
    /revoke all on function public\.ai_lite_usage\(uuid, timestamptz\) from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.ai_lite_usage\(uuid, timestamptz\) to service_role/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.reserve_ai_lite_generation[\s\S]+from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.reserve_ai_lite_generation[\s\S]+to service_role/i,
  );
  assert.match(sql, /pg_advisory_xact_lock\(73190001\)/i);
  assert.match(
    sql,
    /requested_category, provider_cost_usd, expires_at[\s\S]+p_session_cost_ceiling_usd/i,
  );
});

// ── what the platform REPAIRED is recorded too (0043) ────────────────────────────────────
//
// `validation_rule_codes` says why a decision was refused; `adjustments` says what was fixed
// without refusing anything - the brand palette applied over the model's, a furniture colour
// clamped, a mark's chassis re-picked. Lite's claim is "exactly the brand's colours", and
// until this column existed a repaired brand looked identical to an untouched one in the
// ledger (docs/AI_LITE_BRAND_PLAN.md §3.2).
test('the repair ledger column is additive, defaulted and content-free', async () => {
  const body = await readFile(
    new URL('../supabase/migrations/0043_ai_generations_adjustments.sql', import.meta.url),
    'utf8',
  );
  // Additive with a default: rows written before it existed read as "nothing repaired"
  // rather than as null, so every consumer can count without a null branch.
  assert.match(body, /add column if not exists adjustments text\[\] not null default '\{\}'/i);
  // A column carrying codes, never content - and it must not smuggle in access either.
  const code = body.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(code, /\b(prompt|conversation|design_spec|template|generated_code|provider_response|raw_ip)\b/i);
  assert.doesNotMatch(code, /create policy|grant/i);
});

test('Lite quality priors store only non-content facets and stay server-only', () => {
  assert.match(qualitySql, /resolved_variant_id text/i);
  assert.match(qualitySql, /intent_kind text/i);
  assert.match(qualitySql, /feedback_reason text/i);
  assert.doesNotMatch(
    qualitySql,
    /\b(prompt|conversation|design_spec|template|screenshot|generated_code|provider_response|raw_ip)\b/i,
  );
  assert.match(
    qualitySql,
    /revoke all on function public\.ai_lite_variant_quality\(timestamptz, integer\)[\s\S]+from public, anon, authenticated/i,
  );
  assert.match(
    qualitySql,
    /grant execute on function public\.ai_lite_variant_quality\(timestamptz, integer\)[\s\S]+to service_role/i,
  );
  assert.doesNotMatch(qualitySql, /security definer/i);
  assert.match(
    qualitySql,
    /having count\(\*\) >= case when p_min_samples > 4 then p_min_samples else 4 end/i,
  );
  assert.doesNotMatch(qualitySql, /pg_catalog\.greatest/i);
});

// ── the priors the prompt is fed come from OTHER PEOPLE (0032) ───────────────────────────
//
// `ai_lite_variant_quality()` feeds the Lite system prompt a chassis tie-breaker. Until 0032 it
// aggregated every generation in the ledger, and on this instance every one of them was ours:
// 43 from a throwaway test account plus 30 from the fallback bench, not a single user opinion.
// The product was tie-breaking on its own developer's discards, and every bench round made that
// signal stronger.
//
// The filter is the LAST definition of the function that counts, so this reads whichever
// migration defines it most recently rather than naming 0032 - a later redefinition that drops
// the predicate has to fail here, which is the whole point of pinning it.
const variantQualityDefiners = (await readdir(new URL('../supabase/migrations/', import.meta.url)))
  .filter((file) => file.endsWith('.sql'))
  .sort();

test('the Lite chassis priors exclude internal accounts, in whichever migration defines them last', async () => {
  let latest = null;
  for (const file of variantQualityDefiners) {
    const body = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
    if (/create or replace function public\.ai_lite_variant_quality/i.test(body)) latest = { file, body };
  }
  assert.ok(latest, 'no migration defines ai_lite_variant_quality');

  // The same predicate the admin scope uses (0027), so the dashboard and the generator can
  // never disagree about who counts as ours.
  assert.match(
    latest.body,
    /not exists\s*\(\s*select 1 from public\.user_accounts[\s\S]{0,200}?\.internal/i,
    `${latest.file} defines the priors without excluding internal accounts`,
  );
  // ai_generations.user_id is NOT NULL, so the exclusion is exact and needs no anonymous branch.
  // Comments stripped first: this migration EXPLAINS why it stays security invoker, and the
  // write-up naming the thing must not read as the thing - the same trap 0020s test records
  // for RESET ROLE. Caught by this assertion firing on its own explanation.
  const code = latest.body.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(code, /security definer/i, `${latest.file} must stay security invoker`);
  assert.match(
    latest.body,
    /grant execute on function public\.ai_lite_variant_quality\(timestamptz, integer\)[\s\S]+to service_role/i,
  );
  // And it must assert the property, not merely implement it - the lesson 0030 recorded.
  assert.match(
    latest.body,
    /raise exception[^;]*no external account contributed/i,
    `${latest.file} does not assert that every returned pair has an external contributor`,
  );
});
