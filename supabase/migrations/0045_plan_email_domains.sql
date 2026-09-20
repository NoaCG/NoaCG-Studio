-- A plan can name the email DOMAINS it applies to, so a cohort does not have to be assigned
-- one person at a time.
--
-- WHY THIS AND NOT A GRANT. `user_grants` is keyed on `user_id`, so nobody can be authorized
-- before they have an account. That is fine for one colleague and useless for a class: the
-- students who need the plan are exactly the ones who have not signed up yet, so the only
-- workable version of "grant it per user" is chasing each of them after they register, every
-- course. A domain is the fact that is known in advance.
--
-- WHY IT LIVES ON `plans` AND NOT IN AN ENV VAR. docs/ADMIN.md §2: the entitlement resolver is
-- the one thing that decides access, and "why does this user have access" must be answerable
-- with the field the resolver already returned. A domain list read somewhere else would be a
-- second decider and a second answer. On `plans` it is an ASSIGNED PLAN like any other - it
-- sits at the same precedence rank, an explicit assignment still beats it, and a grant or a
-- manual override still beats both.
--
-- It also stays true to "plans are data": no code branches on a plan key, and adding next
-- year's partner domain is a row edit rather than a deploy.
--
-- Content-free: a domain, never an address. The column holds `northvale.edu`, and matching happens
-- server-side against `auth.users.email`, which never leaves the server.

alter table public.plans
  add column if not exists auto_assign_email_domains text[] not null default '{}';

comment on column public.plans.auto_assign_email_domains is
  'Lowercase bare email domains (no @) whose users inherit this plan when they have no explicit '
  'user_plans assignment. Empty = the plan is assigned explicitly only.';

-- Normalize on write so matching never has to guess: lowercase, no leading '@', no blanks, no
-- duplicates. A CHECK would only refuse; this makes the stored value the one shape the resolver
-- reads, whichever surface wrote it.
create or replace function public.plans_normalize_domains()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.auto_assign_email_domains := coalesce((
    select array_agg(distinct domain order by domain)
    from (
      -- Whitespace comes off FIRST: an operator pasting ' @Northvale.EDU ' has spaces before the
      -- '@', so stripping '@' from an untrimmed string strips nothing at all.
      select pg_catalog.ltrim(pg_catalog.btrim(pg_catalog.lower(value)), '@') as domain
      from pg_catalog.unnest(coalesce(new.auto_assign_email_domains, '{}')) as value
    ) as cleaned
    where domain <> '' and domain like '%.%' and domain not like '%@%'
  ), '{}');
  return new;
end;
$$;

drop trigger if exists plans_normalize_domains_trg on public.plans;
create trigger plans_normalize_domains_trg
  before insert or update of auto_assign_email_domains on public.plans
  for each row execute function public.plans_normalize_domains();

-- ONE domain may only ever belong to ONE plan. Without this two plans could both claim
-- `northvale.edu` and the resolver's answer would depend on row order - the same non-determinism
-- migration 0021 exists to prevent for grants, one table over.
--
-- Postgres cannot express that as a constraint on `plans`: a uniqueness rule spanning the
-- UNNESTED elements of an array column, across rows, is not a thing an index or an exclusion
-- constraint can state. So the domains get a table whose PRIMARY KEY says it, kept in step by
-- the trigger below. Two representations of one fact is a smell; the alternative is a rule
-- nothing enforces, which is worse.
create table if not exists public.plan_email_domains (
  domain   text primary key,
  plan_id  uuid not null references public.plans (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now()
);

alter table public.plan_email_domains enable row level security;   -- no policy ⇒ invisible to clients
revoke all on table public.plan_email_domains from public, anon, authenticated;
grant select, insert, update, delete on table public.plan_email_domains to service_role;

-- The array on `plans` is what the admin surface edits; the table above is its uniqueness
-- index, kept in step here rather than by every writer remembering to.
-- NOT `security definer`, deliberately. Both tables it touches are service_role-only, and
-- service_role is the only writer of `plans` - so the trigger has every privilege it needs as
-- the INVOKER, and definer rights would only add Supabase's default EXECUTE grant to `anon`
-- for no gain (`scripts/definer-grants.test.mjs` refuses exactly that, and caught this one).
-- Both client roles are revoked below regardless: a trigger function is never called directly.
create or replace function public.plans_sync_email_domains()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.plan_email_domains where plan_id = new.id;
  insert into public.plan_email_domains (domain, plan_id)
  select value, new.id from pg_catalog.unnest(new.auto_assign_email_domains) as value;
  return new;
end;
$$;

drop trigger if exists plans_sync_email_domains_trg on public.plans;
create trigger plans_sync_email_domains_trg
  after insert or update of auto_assign_email_domains on public.plans
  for each row execute function public.plans_sync_email_domains();

-- Neither trigger function is ever called directly, so neither client role needs EXECUTE.
-- Revoked by ROLE rather than by PUBLIC - the lesson migration 0042 paid for.
revoke all on function public.plans_normalize_domains() from public, anon, authenticated;
revoke all on function public.plans_sync_email_domains() from public, anon, authenticated;

-- Self-check. The triggers only resolve when they RUN, so they are exercised rather than
-- merely created (the lesson migration 0044 paid for on its first push).
do $$
declare
  v_a uuid;
  v_b uuid;
  v_domains text[];
begin
  insert into public.plans (key, name, description, features, limits, render_tier, auto_assign_email_domains)
  values ('0045-check-a', '0045 check A', 'temporary', '{}'::jsonb, '{}'::jsonb, 'free',
          array['  @Northvale.EDU ', 'northvale.edu', 'not a domain', ''])
  returning id into v_a;

  -- (a) Normalization: lowercased, '@' stripped, trimmed, deduped, junk dropped.
  select auto_assign_email_domains into v_domains from public.plans where id = v_a;
  if v_domains is distinct from array['northvale.edu'] then
    raise exception '0045 self-check (a) FAILED: normalized to %', v_domains;
  end if;

  -- (b) The uniqueness table tracked it.
  if not exists (select 1 from public.plan_email_domains where domain = 'northvale.edu' and plan_id = v_a) then
    raise exception '0045 self-check (b) FAILED: the domain was not indexed';
  end if;

  -- (c) A SECOND plan cannot claim the same domain.
  begin
    insert into public.plans (key, name, description, features, limits, render_tier, auto_assign_email_domains)
    values ('0045-check-b', '0045 check B', 'temporary', '{}'::jsonb, '{}'::jsonb, 'free', array['northvale.edu'])
    returning id into v_b;
    raise exception '0045 self-check (c) FAILED: two plans claimed one domain';
  exception when unique_violation then
    null;
  end;

  -- (d) Clearing the array releases the domain.
  update public.plans set auto_assign_email_domains = '{}' where id = v_a;
  if exists (select 1 from public.plan_email_domains where plan_id = v_a) then
    raise exception '0045 self-check (d) FAILED: clearing the array left the domain claimed';
  end if;

  delete from public.plans where key in ('0045-check-a', '0045-check-b');
end;
$$;
