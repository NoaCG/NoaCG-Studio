-- Read-only operations brief. Run with psql "$NOACG_DATABASE_URL" -X -v ON_ERROR_STOP=1
-- -f scripts/admin-report.sql, or through the connected Supabase execute_sql tool.
-- No emails, user ids, feedback messages, prompts, assets or credentials leave the database.
-- Missing tables/functions fail the report; absence must never become a plausible zero.
with windows as (
  select 'current' as period, now() - interval '7 days' as since, now() as until
  union all select 'previous', now() - interval '14 days', now() - interval '7 days'
), activity as (
  select s.scope, w.period, w.since, w.until, to_jsonb(m) as metrics
  from windows w
  cross join (values ('external'), ('internal'), ('all')) s(scope)
  cross join lateral public.admin_overview_window(w.since, w.until, s.scope) m
), state as (
  select s.scope, to_jsonb(m) as metrics
  from (values ('external'), ('all')) s(scope)
  cross join lateral public.admin_overview_state(s.scope) m
), feedback as (
  select w.period, count(f.id) as total,
    count(f.id) filter (where f.sentiment = 'negative') as negative,
    count(f.id) filter (where f.sentiment = 'positive') as positive,
    count(f.id) filter (where f.message <> '') as with_written_note
  from windows w left join public.user_feedback f
    on f.created_at >= w.since and f.created_at < w.until
  group by w.period
), quality as (
  select status, count(*) as generations,
    count(*) filter (where rejection_reason = 'user_discarded') as discarded
  from public.ai_generations where created_at >= now() - interval '7 days'
  group by status
), audit as (
  select action, count(*) as changes from public.admin_audit_log
  where created_at >= now() - interval '7 days' group by action
)
select jsonb_build_object(
  'generated_at', now(),
  'activity', (select jsonb_agg(to_jsonb(a) order by scope, period) from activity a),
  'state', (select jsonb_agg(to_jsonb(s) order by scope) from state s),
  'feedback_all_accounts', (select jsonb_agg(to_jsonb(f) order by period) from feedback f),
  'feedback_backlog', (select jsonb_build_object('new', count(*), 'oldest', min(created_at))
    from public.user_feedback where status = 'new'),
  'quality_all_accounts', coalesce((select jsonb_agg(to_jsonb(q) order by status) from quality q), '[]'::jsonb),
  'operator_changes', coalesce((select jsonb_agg(to_jsonb(a) order by action) from audit a), '[]'::jsonb),
  'disabled_features', (select value from public.system_settings where key = 'disabled_features'),
  'disabled_routes', (select value from public.system_settings where key = 'disabled_routes')
) as report;
