-- THE SYNC LIST STOPS OPENING THE DOCUMENT (docs/work-specs/database-work-per-user/spec.md).
--
-- A sync pass lists every kind, reading one field per row: the client's revision time inside `body`.
-- Reading one field of a jsonb column makes Postgres fetch and decompress the whole stored value, so
-- each list paid for the library it did not download. On production from 06:44 to 11:29 UTC on
-- 2026-11-03 this statement was the largest disk reader: 1862 of about 4640 blocks in 102 calls.
--
-- `body_updated_at` holds a copy of `body->'updatedAt'`, as jsonb, so what a list reads is exactly
-- what the body says, including a body with no such field or with one that is not a string
-- (`bodyUpdatedAt` in src/backend/storage.ts turns those into the epoch either way). It is still the
-- CLIENT'S timestamp and the sync tiebreak; the `updated_at` column stays the server's write time
-- (0001 says why they differ).
--
-- A trigger keeps the copy, so every writer is covered: PostgREST upserts, and the agent functions
-- that insert documents directly (0067, 0093, 0094). It fires only when a statement names `body` or
-- the copy itself, so an update of other columns pays nothing and a client cannot set a false value.
-- A stored generated column would say the same in one line, but adding one rewrites the whole table.
--
-- The backfill must not move `updated_at`: the tombstone purge, control_unpublish_deleted and the
-- agents' library listing read it. So the server's trigger is off for that one statement. The whole
-- file is one transaction holding the table's strongest lock, so sync reads and writes wait for it.
-- Reading every graphic's revision took 277 ms on production (2026-11-03), and the short
-- statement_timeout caps the wait: past it nothing applies, and no list ever sees a half-filled
-- column. A Take and an output load do not read this table.
--
-- Additive. An older page keeps selecting from `body`, and a page on an instance without this column
-- falls back to that read (SupabaseProvider.list). Revert: drop the trigger, the function and the
-- column; the list falls back by itself.

set lock_timeout = '2s';
set statement_timeout = '10s';

alter table public.documents add column body_updated_at jsonb;

alter table public.documents disable trigger documents_set_updated_at;
update public.documents set body_updated_at = body->'updatedAt';
alter table public.documents enable trigger documents_set_updated_at;

create function public.documents_copy_body_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.body_updated_at := new.body->'updatedAt';
  return new;
end;
$$;
revoke all on function public.documents_copy_body_updated_at() from public, anon, authenticated;

create trigger documents_copy_body_updated_at
  before insert or update of body, body_updated_at on public.documents
  for each row execute function public.documents_copy_body_updated_at();

-- Self-check: a throwaway row through every write a client makes, undone by a sentinel the block
-- catches. Skipped on an instance with no account yet (0036's pattern).
do $$
declare
  v_owner uuid;
  v_id    uuid := '00000000-0107-4000-8000-000000000001';
  v_copy  jsonb;
begin
  if (select t.tgenabled from pg_catalog.pg_trigger t
       where t.tgrelid = 'public.documents'::regclass and t.tgname = 'documents_set_updated_at') <> 'O' then
    raise exception '0107: the server write time trigger was left off';
  end if;

  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice '0107 self-check skipped: no account on this instance';
    return;
  end if;
  begin
    insert into public.documents (id, user_id, kind, body)
    values (v_id, v_owner, 'look', '{"updatedAt":"2026-11-03T00:00:00.000Z"}');
    select d.body_updated_at into v_copy from public.documents d where d.id = v_id;
    if v_copy is distinct from '"2026-11-03T00:00:00.000Z"'::jsonb then
      raise exception '0107: an insert did not copy the revision: %', v_copy;
    end if;

    -- The shape of a PostgREST upsert, which is how a sync pass writes.
    insert into public.documents (id, user_id, kind, body)
    values (v_id, v_owner, 'look', '{"updatedAt":"2026-11-03T00:00:01.000Z"}')
    on conflict (id) do update set body = excluded.body;
    select d.body_updated_at into v_copy from public.documents d where d.id = v_id;
    if v_copy is distinct from '"2026-11-03T00:00:01.000Z"'::jsonb then
      raise exception '0107: an upsert did not copy the revision: %', v_copy;
    end if;

    update public.documents set body_updated_at = '"1970-01-01T00:00:00.000Z"' where id = v_id;
    select d.body_updated_at into v_copy from public.documents d where d.id = v_id;
    if v_copy is distinct from '"2026-11-03T00:00:01.000Z"'::jsonb then
      raise exception '0107: a write to the copy was kept: %', v_copy;
    end if;

    update public.documents set body = '{}' where id = v_id;
    select d.body_updated_at into v_copy from public.documents d where d.id = v_id;
    if v_copy is not null then
      raise exception '0107: a body with no revision kept the old copy: %', v_copy;
    end if;

    raise exception '0107 self-check rollback';
  exception when raise_exception then
    if sqlerrm <> '0107 self-check rollback' then raise; end if;
  end;
end $$;
