-- Retire the closed Era 5.5 community gallery's database objects (issue #836). The gallery closed
-- to publishing in 0078 (owner, 2026-10-08: the community shares reviewed packs only), and its
-- last UI, Home's "My community templates" list, leaves the app with this migration.
--
-- NO USER DATA IS DELETED. The block below locks both tables and RAISES unless both are empty, so
-- the drops run only on tables proven empty in the same transaction; a database that still holds a
-- published template or a report keeps everything and the whole file rolls back. Production held
-- 0 rows in community_templates and 0 in community_reports on 2026-10-08, and 0078 has refused
-- every new publish since.
--
-- Dropped: community_list and community_get (the browse RPCs), community_reports, then
-- community_templates with every policy, trigger and index on it (0004, 0005, 0018, 0020, 0022,
-- 0078), and the two trigger functions only those tables used. No CASCADE: anything else that
-- still depends on these objects stops the migration instead of disappearing with them.
--
-- KEPT, on purpose:
--   * moderators and is_moderator(): community packs use them (0079).
--   * the community.publish entitlement: community_pack_submit checks it (0080).
--   * the community-assets bucket, its quota row (0039) and its three storage policies (0004,
--     0022, 0078). It held one object a user uploaded (70 bytes, 2026-07-07) on 2026-10-08, and
--     deleting a user's upload is out of scope here; 0078's policy still refuses every new upload.
--
-- Revert: re-run 0004 and 0005, then the community_templates and community_reports parts of 0018,
-- 0020, 0022, 0051, 0052 and 0078. Nothing else changes here.
set lock_timeout = '2s';
set statement_timeout = '30s';

do $$
declare
  v_templates bigint;
  v_reports   bigint;
begin
  -- Hold both tables until the transaction ends, so no row can arrive between the count and the drop.
  lock table public.community_templates, public.community_reports in access exclusive mode;
  select count(*) into v_templates from public.community_templates;
  select count(*) into v_reports from public.community_reports;
  if v_templates > 0 or v_reports > 0 then
    raise exception '0085 refused: community_templates holds % row(s) and community_reports % row(s). It retires only empty tables, so nothing was changed.',
      v_templates, v_reports;
  end if;
end $$;

drop function if exists public.community_list(text, text, int, int);
drop function if exists public.community_get(text);
drop table if exists public.community_reports;
drop table if exists public.community_templates;
drop function if exists public.community_moderation_guard();
drop function if exists public.community_report_guard();

-- Self-check: the gallery is gone, and what community packs and the bucket rely on is not.
do $$
begin
  if to_regclass('public.community_templates') is not null
     or to_regclass('public.community_reports') is not null then
    raise exception '0085 self-check FAILED: a gallery table is still there';
  end if;
  if to_regprocedure('public.community_list(text, text, integer, integer)') is not null
     or to_regprocedure('public.community_get(text)') is not null
     or to_regprocedure('public.community_moderation_guard()') is not null
     or to_regprocedure('public.community_report_guard()') is not null then
    raise exception '0085 self-check FAILED: a gallery function is still there';
  end if;
  if to_regclass('public.moderators') is null
     or to_regprocedure('public.is_moderator()') is null
     or to_regprocedure('public.community_pack_submit(text, text, text, jsonb)') is null then
    raise exception '0085 self-check FAILED: something community packs use is missing';
  end if;
  if not exists (select 1 from storage.buckets b where b.id = 'community-assets')
     or not exists (select 1 from pg_policies p
                    where p.schemaname = 'storage' and p.tablename = 'objects'
                      and p.policyname = 'community_assets_closed') then
    raise exception '0085 self-check FAILED: the community-assets bucket or its upload refusal is missing';
  end if;
  -- The one behaviour left to call: is_moderator() still answers.
  perform public.is_moderator();
end $$;
