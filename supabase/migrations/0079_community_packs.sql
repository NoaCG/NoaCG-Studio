-- Community packs: a set of graphics a maker submits from the wizard's shelf, checked, reviewed
-- by a NoaCG admin, and then offered to everyone (docs/work-specs/community-packs/spec.md).
--
-- The table grants NOTHING to clients. Every read and write goes through the security definer
-- functions below, so the rules live in one place: others read only `live` packs, a maker reads
-- and withdraws their own, only a moderator decides, and - until the design lock (AC-5) lands -
-- only a moderator may submit (spec D12). Opening submit to every signed-in account is a later
-- migration that replaces `community_pack_submit`.
set lock_timeout = '2s';
set statement_timeout = '30s';

create table if not exists public.community_packs (
  id            uuid primary key default gen_random_uuid(),
  -- One pack across its versions: an update is a new row with the same lineage (spec D11).
  lineage       uuid not null default gen_random_uuid(),
  version       integer not null default 1 check (version >= 1),
  author_id     uuid not null references auth.users (id) on delete cascade,
  -- The name the maker chose for this pack, never derived from the account (spec D15).
  author_name   text not null check (char_length(author_name) between 1 and 60),
  name          text not null check (char_length(name) between 1 and 80),
  description   text not null check (char_length(description) between 1 and 200),
  graphics      integer not null check (graphics between 1 and 50),
  -- The noacg-pack file, assets inlined. `author` and `license` inside it are written here.
  pack          jsonb not null,
  state         text not null default 'in_review'
                check (state in ('in_review', 'live', 'not_accepted', 'withdrawn', 'taken_down', 'replaced')),
  reason        text check (reason is null or char_length(reason) <= 300),
  submitted_at  timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references auth.users (id) on delete set null
);
create index if not exists community_packs_state_idx on public.community_packs (state, decided_at desc);
create index if not exists community_packs_author_idx on public.community_packs (author_id, submitted_at desc);
create index if not exists community_packs_lineage_idx on public.community_packs (lineage);
alter table public.community_packs enable row level security;
revoke all on table public.community_packs from public, anon, authenticated;
grant all on table public.community_packs to service_role;

-- The shelf: every live pack, newest approval first. Anyone, signed in or not (owner, 2026-10-08).
create or replace function public.community_pack_shelf()
returns table (id uuid, name text, description text, author_name text, graphics integer, version integer, decided_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.description, p.author_name, p.graphics, p.version, p.decided_at
  from public.community_packs p
  where p.state = 'live'
  order by p.decided_at desc nulls last, p.submitted_at desc;
$$;
revoke all on function public.community_pack_shelf() from public;
grant execute on function public.community_pack_shelf() to anon, authenticated;

-- One pack file: a live one for anyone, the maker's own in any state, any for a moderator.
create or replace function public.community_pack_file(p_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select p.pack
  from public.community_packs p
  where p.id = p_id
    and (p.state = 'live' or p.author_id = (select auth.uid()) or public.is_moderator());
$$;
revoke all on function public.community_pack_file(uuid) from public;
grant execute on function public.community_pack_file(uuid) to anon, authenticated;

-- The maker's own submissions, every state but `replaced`, newest first.
create or replace function public.community_pack_mine()
returns table (id uuid, lineage uuid, version integer, name text, description text, author_name text,
               graphics integer, state text, reason text, submitted_at timestamptz, decided_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.lineage, p.version, p.name, p.description, p.author_name, p.graphics, p.state,
         p.reason, p.submitted_at, p.decided_at
  from public.community_packs p
  where p.author_id = (select auth.uid()) and p.state <> 'replaced'
  order by p.submitted_at desc;
$$;
revoke all on function public.community_pack_mine() from public, anon;
grant execute on function public.community_pack_mine() to authenticated;

-- What waits for review, oldest first. A non-moderator gets nothing.
create or replace function public.community_pack_waiting()
returns table (id uuid, name text, description text, author_name text, graphics integer, version integer, submitted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.description, p.author_name, p.graphics, p.version, p.submitted_at
  from public.community_packs p
  where p.state = 'in_review' and public.is_moderator()
  order by p.submitted_at;
$$;
revoke all on function public.community_pack_waiting() from public, anon;
grant execute on function public.community_pack_waiting() to authenticated;

-- Submit for review. Moderators only until AC-5 lands (spec D12).
create or replace function public.community_pack_submit(p_name text, p_description text, p_author text, p_pack jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_author text := btrim(coalesce(p_author, ''));
  v_count integer;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to submit a pack.';
  end if;
  if not public.is_moderator() then
    raise exception 'Submitting packs is open to NoaCG only for now.';
  end if;
  if public.is_suspended() then
    raise exception 'This account cannot submit packs.';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'The pack needs a name of at most 80 characters.';
  end if;
  if char_length(v_description) not between 1 and 200 then
    raise exception 'The pack needs a description of at most 200 characters.';
  end if;
  if char_length(v_author) not between 1 and 60 then
    raise exception 'The pack needs the name it is shown under, at most 60 characters.';
  end if;
  if p_pack is null or jsonb_typeof(p_pack) <> 'object' or p_pack->>'format' is distinct from 'noacg-pack'
     or jsonb_typeof(p_pack->'graphics') is distinct from 'array' then
    raise exception 'That is not a NoaCG graphics pack.';
  end if;
  v_count := jsonb_array_length(p_pack->'graphics');
  if v_count not between 1 and 50 then
    raise exception 'A pack holds between 1 and 50 graphics.';
  end if;
  if octet_length(p_pack::text) > 8388608 then
    raise exception 'The pack is larger than 8 MB.';
  end if;
  if (select count(*) from public.community_packs c where c.author_id = v_uid and c.state = 'in_review') >= 10 then
    raise exception 'Ten packs are already waiting for review. Wait for a decision first.';
  end if;
  insert into public.community_packs (author_id, author_name, name, description, graphics, pack)
  values (
    v_uid, v_author, v_name, v_description, v_count,
    p_pack || jsonb_build_object('name', v_name, 'description', v_description, 'author', v_author, 'license', 'CC-BY-4.0')
  )
  returning community_packs.id into v_id;
  return v_id;
end;
$$;
revoke all on function public.community_pack_submit(text, text, text, jsonb) from public, anon;
grant execute on function public.community_pack_submit(text, text, text, jsonb) to authenticated;

-- The maker takes their own pack off the queue or the shelf at once (spec D6).
create or replace function public.community_pack_withdraw(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.community_packs p
     set state = 'withdrawn'
   where p.id = p_id and p.author_id = (select auth.uid()) and p.state in ('in_review', 'live');
  if not found then
    raise exception 'That pack is not yours to withdraw, or it is no longer offered.';
  end if;
end;
$$;
revoke all on function public.community_pack_withdraw(uuid) from public, anon;
grant execute on function public.community_pack_withdraw(uuid) to authenticated;

-- A moderator approves (live), turns down (not_accepted) or takes down (taken_down). A reason is
-- required for the last two; approving a new version replaces the live one of the same lineage.
create or replace function public.community_pack_decide(p_id uuid, p_state text, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_row public.community_packs%rowtype;
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Only a NoaCG admin can decide on a pack.';
  end if;
  if p_state not in ('live', 'not_accepted', 'taken_down') then
    raise exception 'Unknown decision.';
  end if;
  if p_state <> 'live' and v_reason is null then
    raise exception 'Give the maker a reason.';
  end if;
  if v_reason is not null and char_length(v_reason) > 300 then
    raise exception 'Keep the reason under 300 characters.';
  end if;
  select * into v_row from public.community_packs c where c.id = p_id for update;
  if not found then
    raise exception 'That pack no longer exists.';
  end if;
  if (p_state in ('live', 'not_accepted') and v_row.state <> 'in_review')
     or (p_state = 'taken_down' and v_row.state <> 'live') then
    raise exception 'That pack is no longer in the state this decision needs.';
  end if;
  if p_state = 'live' then
    update public.community_packs c
       set state = 'replaced'
     where c.lineage = v_row.lineage and c.state = 'live' and c.id <> p_id;
  end if;
  update public.community_packs c
     set state = p_state, reason = v_reason, decided_at = now(), decided_by = v_uid
   where c.id = p_id;
end;
$$;
revoke all on function public.community_pack_decide(uuid, text, text) from public, anon;
grant execute on function public.community_pack_decide(uuid, text, text) to authenticated;

-- Self-check: the table is closed to clients and every door exists. Behaviour is exercised against
-- a local stack (docs/work-specs/community-packs/evidence/), since a call needs a signed-in caller.
do $$
begin
  if has_table_privilege('anon', 'public.community_packs', 'select')
     or has_table_privilege('authenticated', 'public.community_packs', 'select')
     or has_table_privilege('authenticated', 'public.community_packs', 'insert')
     or has_table_privilege('authenticated', 'public.community_packs', 'update') then
    raise exception '0079 self-check: community_packs is readable or writable by a client role';
  end if;
  if has_function_privilege('anon', 'public.community_pack_submit(text, text, text, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.community_pack_decide(uuid, text, text)', 'execute') then
    raise exception '0079 self-check: anon may submit or decide';
  end if;
  if not has_function_privilege('anon', 'public.community_pack_shelf()', 'execute') then
    raise exception '0079 self-check: the shelf is not readable signed out';
  end if;
end;
$$;
