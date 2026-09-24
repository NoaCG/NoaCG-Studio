-- WAITING PACKAGES - a whole graphics package a coding agent sent to the user's Home
-- (docs/AGENT_SAVE.md §7, api/_lib/me/packages.ts).
--
-- `noacg save` already puts ONE graphic in a user's library (0050). A package is several graphics
-- plus their playout layers and a prepared cue rundown - a whole production's worth - and a
-- production is something the user should see arrive and choose to set up. So a package does not
-- become a production on the server. It waits here, the studio lists it on Home -> Productions
-- with an Install button, and Install runs the studio's own `installPack` in the user's session:
-- every graphic re-validated through the export gate, the production created, the rundown seeded.
-- Install (or Dismiss) then deletes the row.
--
-- ACCESS POSTURE. The service role INSERTS (the function at api/me, after the agent key and the
-- shape guard); there is deliberately no insert or update policy, so a browser can never write a
-- package here. A signed-in user may READ and DELETE their own rows and nothing else.
--
-- `body` is the pack file (`noacg-pack` v1) exactly as the shape guard narrowed it. The code
-- inside it is never executed by the database or the function - only by the studio, in the
-- user's browser, behind the validation gate.

create table if not exists public.agent_packages (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null,
  description    text not null default '',
  -- Shown on the waiting row ("12 graphics") without reading the whole body.
  graphic_count  integer not null check (graphic_count > 0),
  -- Provenance, never proof: `{ tool: 'noacg-cli', version }`.
  origin         jsonb not null default '{}'::jsonb,
  body           jsonb not null,
  created_at     timestamptz not null default now()
);

create index if not exists agent_packages_user_created_idx
  on public.agent_packages (user_id, created_at desc);

alter table public.agent_packages enable row level security;

create policy "agent_packages_select_own" on public.agent_packages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "agent_packages_delete_own" on public.agent_packages
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Stated, not inherited (0051), and the revoke first (0052): a grant alone would leave whatever
-- the hosted bootstrap handed out. The browser may read and delete its own rows; the server writes.
revoke all on table public.agent_packages from public, anon, authenticated;
grant select, delete on table public.agent_packages to authenticated;
grant select, insert, delete on table public.agent_packages to service_role;

-- Self-check: the privileges are exactly the ones above - present where a policy needs them,
-- ABSENT where the browser must not reach (a browser INSERT would skip the shape guard).
do $$
begin
  if not has_table_privilege('authenticated', 'public.agent_packages', 'SELECT')
     or not has_table_privilege('authenticated', 'public.agent_packages', 'DELETE') then
    raise exception '0065 self-check FAILED: authenticated is missing a privilege its policies need';
  end if;
  if has_table_privilege('authenticated', 'public.agent_packages', 'INSERT')
     or has_table_privilege('authenticated', 'public.agent_packages', 'UPDATE') then
    raise exception '0065 self-check FAILED: a browser could write agent_packages around the shape guard';
  end if;
  if has_table_privilege('anon', 'public.agent_packages', 'SELECT')
     or has_table_privilege('anon', 'public.agent_packages', 'INSERT')
     or has_table_privilege('anon', 'public.agent_packages', 'UPDATE')
     or has_table_privilege('anon', 'public.agent_packages', 'DELETE') then
    raise exception '0065 self-check FAILED: anon holds a privilege on agent_packages';
  end if;
  if not exists (select 1 from pg_class where oid = 'public.agent_packages'::regclass and relrowsecurity) then
    raise exception '0065 self-check FAILED: row level security is off on agent_packages';
  end if;
end $$;
