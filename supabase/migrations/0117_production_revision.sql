-- THE SAVED REVISION OF A PRODUCTION (docs/work-specs/live-publishing/designs/G3.md section 1).
--
-- Automatic updates publish each save of a production, and a publication must never replace one
-- built from a newer save. That needs one number per stored version of a production record that
-- only grows, whichever table the record lives in: a personal production is a `documents` row of
-- kind `show` (a whole-record upsert from the sync engine), a team production a `team_productions`
-- row (compare-and-swap through `team_production_save`).
--
-- One sequence feeds both tables, so a production moved from personal to team keeps counting up. A
-- before-row trigger sets the number on every store, after the row is locked, so two saves of one
-- record get increasing numbers in the order they are stored. A client never chooses it: a value it
-- sends is overwritten. Every writer is covered, older pages and the agent functions that insert
-- documents included, because the trigger is on the table. The trigger names its columns, so an
-- update of other columns pays nothing (the 0107 pattern).
--
-- `team_production_save` is replaced with the same signature and the same answer plus `rev`, the
-- number of the row it stored or found; a page built before this ignores the extra member.
--
-- Additive: a sequence, two nullable columns with no default (no table rewrite), two triggers, one
-- function body. Nothing reads `rev` until the app built for G3 does, and that app works without it.
-- Revert: drop the two triggers, their functions, the two columns and the sequence, and restore
-- 0054's `team_production_save`.

set lock_timeout = '2s';
set statement_timeout = '30s';

create sequence if not exists public.production_revision as bigint;
revoke all on sequence public.production_revision from public, anon, authenticated;

alter table public.documents add column if not exists rev bigint;
alter table public.team_productions add column if not exists rev bigint;

-- Definer: the sequence belongs to no client role, and the trigger runs as whoever writes.
create or replace function public.production_revision_next()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.rev := nextval('public.production_revision');
  return new;
end $$;
revoke all on function public.production_revision_next() from public, anon, authenticated;

drop trigger if exists documents_production_revision on public.documents;
create trigger documents_production_revision
  before insert or update of body, deleted, rev on public.documents
  for each row when (new.kind = 'show')
  execute function public.production_revision_next();

drop trigger if exists team_productions_revision on public.team_productions;
create trigger team_productions_revision
  before insert or update of doc, rev on public.team_productions
  for each row execute function public.production_revision_next();

-- 0054's compare-and-swap save, unchanged but for `rev` in each answer.
create or replace function public.team_production_save(p_id uuid, p_expected timestamptz, p_doc jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user  uuid := (select auth.uid());
  v_row   public.team_productions%rowtype;
  v_stamp timestamptz;
  v_rev   bigint;
begin
  if v_user is null then
    raise exception 'saving a team production needs a signed-in account' using errcode = '42501';
  end if;
  if public.is_suspended() then
    raise exception 'this account is suspended' using errcode = '42501';
  end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then
    raise exception 'a team production document must be a JSON object' using errcode = 'check_violation';
  end if;
  select * into v_row from public.team_productions p where p.id = p_id;
  if v_row.id is null then
    raise exception 'unknown team production' using errcode = 'no_data_found';
  end if;
  if not public.is_team_member(v_row.team_id) then
    raise exception 'not a member of the team that holds this production' using errcode = '42501';
  end if;
  if p_expected is null or v_row.updated_at is distinct from p_expected then
    return jsonb_build_object(
      'saved', false,
      'updated_at', v_row.updated_at,
      'updated_by', v_row.updated_by,
      'doc', v_row.doc,
      'rev', v_row.rev
    );
  end if;
  update public.team_productions p
     set doc = p_doc,
         updated_by = v_user,
         updated_at = greatest(date_trunc('milliseconds', clock_timestamp()),
                               p.updated_at + interval '1 millisecond')
   where p.id = p_id and p.updated_at = p_expected
   returning p.updated_at, p.rev into v_stamp, v_rev;
  if v_stamp is null then
    select * into v_row from public.team_productions p where p.id = p_id;
    return jsonb_build_object(
      'saved', false,
      'updated_at', v_row.updated_at,
      'updated_by', v_row.updated_by,
      'doc', v_row.doc,
      'rev', v_row.rev
    );
  end if;
  return jsonb_build_object('saved', true, 'updated_at', v_stamp, 'updated_by', v_user, 'rev', v_rev);
end $$;
revoke all on function public.team_production_save(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.team_production_save(uuid, timestamptz, jsonb) to authenticated;

-- Self-check: structure and privileges always; behaviour on a throwaway row when an account exists
-- (0107's pattern), undone before the block ends.
do $$
declare
  v_owner uuid;
  v_id    uuid := '00000000-0117-4000-8000-000000000001';
  v_look  uuid := '00000000-0117-4000-8000-000000000002';
  v_a     bigint;
  v_b     bigint;
  v_c     bigint;
begin
  if has_sequence_privilege('anon', 'public.production_revision', 'USAGE')
     or has_sequence_privilege('authenticated', 'public.production_revision', 'USAGE')
     or has_sequence_privilege('authenticated', 'public.production_revision', 'UPDATE') then
    raise exception '0117: a client role can move the revision sequence';
  end if;
  if has_function_privilege('authenticated', 'public.production_revision_next()', 'EXECUTE')
     or has_function_privilege('anon', 'public.production_revision_next()', 'EXECUTE') then
    raise exception '0117: a client role can call the revision trigger function';
  end if;
  if not has_function_privilege('authenticated', 'public.team_production_save(uuid, timestamptz, jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.team_production_save(uuid, timestamptz, jsonb)', 'EXECUTE') then
    raise exception '0117: EXECUTE on team_production_save is wrong for a client role';
  end if;

  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice '0117 self-check skipped: no account on this instance';
    return;
  end if;
  begin
    insert into public.documents (id, user_id, kind, body, rev) values (v_id, v_owner, 'show', '{"name":"a"}', -1);
    select d.rev into v_a from public.documents d where d.id = v_id;
    if v_a is null or v_a < 1 then
      raise exception '0117: an insert kept a client revision or none: %', v_a;
    end if;
    update public.documents set body = '{"name":"b"}' where id = v_id;
    select d.rev into v_b from public.documents d where d.id = v_id;
    if v_b is null or v_b <= v_a then
      raise exception '0117: a save did not move the revision up (% then %)', v_a, v_b;
    end if;
    update public.documents set name = 'renamed' where id = v_id;
    select d.rev into v_c from public.documents d where d.id = v_id;
    if v_c is distinct from v_b then
      raise exception '0117: an update of other columns moved the revision';
    end if;
    update public.documents set rev = -1 where id = v_id;
    select d.rev into v_c from public.documents d where d.id = v_id;
    if v_c is null or v_c <= v_b then
      raise exception '0117: a client wrote the revision: %', v_c;
    end if;
    insert into public.documents (id, user_id, kind, body) values (v_look, v_owner, 'look', '{}');
    if (select d.rev from public.documents d where d.id = v_look) is not null then
      raise exception '0117: a document of another kind got a revision';
    end if;
    raise exception 'self-check-done';
  exception when raise_exception then
    if sqlerrm <> 'self-check-done' then raise; end if;
  end;
end $$;
