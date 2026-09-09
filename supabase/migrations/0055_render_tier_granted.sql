-- The widest render cap table stops calling itself 'paid'.
--
-- WHY. `src/render/limits.ts` declared `RenderTier = 'anonymous' | 'free' | 'paid'`, and the third
-- member is reachable today: a `plans.render_tier` an admin set, or one auto-assigned by e-mail
-- domain (0045). Nobody has ever bought it. It exists for a school grant or a heavy-use exception,
-- NoaCG sells nothing, and no billing is planned (docs/OWNER_RULINGS.md, 2026-09-07). The name is
-- false about what the thing is, and it is not hidden: the admin Plans editor offers the tier list
-- straight out of `RENDER_LIMITS`, so an operator was reading "paid" in a dropdown on a product
-- with nothing to sell. 'granted' is what you actually get, and it matches the vocabulary the
-- codebase already uses for the same idea (`src/entitlements/contract.ts` issues the grants).
--
-- WHAT CARRIES THE OLD NAME. Two columns, and they are different in kind:
--
--   * `plans.render_tier` - free text with a default and NO check constraint (0018 says why: the
--     tier table is code, and a plan row must not be able to break the render path by naming
--     something that is not in it). An admin may have typed anything here; this migration rewrites
--     the one value the code used to have.
--   * `render_jobs.tier` - text WITH a check constraint, written inline in 0007 and therefore
--     named `render_jobs_tier_check` by Postgres. This is the only check constraint anywhere on a
--     render tier name; the comment in limits.ts that also blamed 0018 was wrong, and is corrected
--     in the same commit.
--
-- ORDER MATTERS INSIDE THIS FILE. The rows are rewritten BEFORE the constraint is replaced, so the
-- new constraint is validated against data that already satisfies it. Doing it the other way round
-- fails on any database that has ever had a job on the old tier.
--
-- SAFE TO RUN AGAINST A DATABASE THAT ALREADY HAS THE OLD ROWS - that is the whole job - and safe
-- to run twice: the UPDATEs match nothing the second time, and the constraint is dropped by name
-- before it is added back.
--
-- SAFE IN EITHER DEPLOY ORDER. Code that reaches production before this migration does still reads
-- a stored 'paid' as the 'granted' caps it always meant (`storedRenderTier` in src/render/limits.ts
-- is the single seam), so no in-flight render job loses its output TTL and no granted plan silently
-- narrows to free. This migration is what lets that compatibility shim eventually be deleted.

-- ── plans ────────────────────────────────────────────────────────────────────────────────────
update public.plans set render_tier = 'granted' where render_tier = 'paid';

-- ── render jobs ──────────────────────────────────────────────────────────────────────────────
update public.render_jobs set tier = 'granted' where tier = 'paid';

-- Drop-and-add is the only way to redefine a check constraint; `db push` recognises the pair as a
-- replacement rather than a removal because this file adds the same name straight back.
alter table public.render_jobs drop constraint if exists render_jobs_tier_check;
alter table public.render_jobs add constraint render_jobs_tier_check
  check (tier in ('anonymous', 'free', 'granted'));

-- ── self-check ───────────────────────────────────────────────────────────────────────────────
-- A constraint that merely EXISTS proves nothing about which values it admits, and 0007 named this
-- one implicitly - if Postgres ever picked a different name, the drop above would have missed and
-- the old constraint would still be sitting there. So both directions are exercised against a real
-- throwaway row, which is the only thing that can tell those cases apart.
do $$
declare
  v_id uuid := gen_random_uuid();   -- core Postgres since 13, not pgcrypto (see 0003)
  v_stale integer;
begin
  -- (a) Nothing is left on the old value.
  select count(*) into v_stale from public.plans where render_tier = 'paid';
  if v_stale <> 0 then
    raise exception '0055 self-check (a) FAILED: % plan rows still name the retired tier', v_stale;
  end if;
  select count(*) into v_stale from public.render_jobs where tier = 'paid';
  if v_stale <> 0 then
    raise exception '0055 self-check (a) FAILED: % job rows still name the retired tier', v_stale;
  end if;

  -- (b) The new name is accepted.
  insert into public.render_jobs
    (id, user_id, ip_hash, tier, job_token_hash, worker_secret_hash, format,
     width, height, fps, total_frames, manifest_hash, deadline_at)
  values
    (v_id, null, '0055-check', 'granted', '0055', '0055', 'mp4',
     16, 16, 25, 1, '0055', now() + interval '1 minute');

  -- (c) The old name is refused. (b) is what catches a differently-named 0007 constraint still
  --     being in force - the insert of 'granted' would have failed there against it.
  begin
    update public.render_jobs set tier = 'paid' where id = v_id;
    raise exception '0055 self-check (c) FAILED: the retired tier name is still accepted';
  exception when check_violation then
    null;
  end;

  -- (d) No check constraint on this table mentions the retired name any more - which is the claim
  --     that fails if 0007's inline constraint was named something other than the name dropped
  --     above and is therefore still in force alongside the new one.
  if exists (
    select 1
      from pg_constraint c
     where c.conrelid = 'public.render_jobs'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%''paid''%'
  ) then
    raise exception '0055 self-check (d) FAILED: a check constraint still names the retired tier';
  end if;

  delete from public.render_jobs where id = v_id;
end $$;

comment on column public.render_jobs.tier is
  'The src/render/limits.ts RenderTier the job was admitted at. The widest table was called paid until 0055; nothing is sold, and it is a grant.';
