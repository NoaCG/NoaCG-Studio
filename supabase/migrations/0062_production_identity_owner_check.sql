-- A PRODUCTION'S ADDRESSES GO BACK ONLY TO WHOEVER HOLDS THE PRODUCTION.
--
-- 0040 made a re-published production get its own URLs back: `control_show_identity` remembers the
-- control, output, join and presenter slugs by production id, and a BEFORE INSERT trigger hands
-- them to the next `control_shows` row with that id. It matched on the ID ALONE. Production ids are
-- client-supplied uuids and not secret - `control_output_by_slug` and `control_show_by_slug` both
-- answer them, and a renderer needs one - so once a production was unpublished (by its owner, or by
-- the daily sweep in 0061), ANY signed-in account could publish a row with that id and be handed
-- all four addresses: the owner's OBS/CasparCG output URL would render the other account's
-- content, the audience join link would lead there, and the owner could no longer re-publish at
-- all, because the id was taken.
--
-- Now the addresses are restored only to the account that recorded them, or - for a team
-- production - to a member of the team that holds it (any member may re-publish a team production,
-- 0054). Anybody else publishing a row with a remembered id is REFUSED rather than given fresh
-- addresses, because letting them keep the id would still lock the owner out of their own
-- production. A production published for the first time has no identity row and is untouched.
--
-- The membership test needs no `is_team_member` call of its own: `control_shows_owner_all`'s
-- WITH CHECK already requires a team-stamped row to be written by a member of that team, and the
-- restrictive insert policy requires `owner_id` to be the caller. What this adds is that the TEAM
-- actually holds this production (`team_productions`, 0054), so stamping a row with some team you
-- belong to does not open somebody else's production.

create or replace function public.control_show_restore_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v public.control_show_identity%rowtype;
begin
  select * into v from public.control_show_identity i where i.id = new.id;
  if not found then
    return new;
  end if;

  if v.owner_id is distinct from new.owner_id and not (
    new.team_id is not null
    and exists (
      select 1 from public.team_productions tp
      where tp.id = new.id and tp.team_id = new.team_id
    )
  ) then
    raise exception 'this production belongs to another account'
      using errcode = '42501';
  end if;

  new.slug := v.slug;
  if v.output_slug is not null then new.output_slug := v.output_slug; end if;
  if v.join_slug is not null then new.join_slug := v.join_slug; end if;
  if v.presenter_slug is not null then new.presenter_slug := v.presenter_slug; end if;
  return new;
end $$;

-- Same closure as 0042: a trigger fires without the caller holding EXECUTE, so no client role
-- needs it, and a definer function nobody may call directly cannot be misused directly.
revoke all on function public.control_show_restore_identity() from public, anon, authenticated;

-- ── The remembered owner follows the published row ─────────────────────────────────────────────
-- The check above compares against `control_show_identity.owner_id`, which 0040 wrote once, at the
-- first publish, and never again. That is the wrong account after a team production changes hands
-- (the team owner's move-out verb, 0054, rewrites `owner_id` on the live row): the new owner would
-- be refused their own production at the next re-publish. So the record now carries the CURRENT
-- owner, and is rewritten when `owner_id` changes as well as when a slug does. Only a row that
-- passed the check above, or an UPDATE the policies and 0054's guard already admitted, ever gets
-- here, so this cannot be used to take an identity over.
create or replace function public.control_show_record_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.control_show_identity as i
    (id, owner_id, slug, output_slug, join_slug, presenter_slug)
  values (new.id, new.owner_id, new.slug, new.output_slug, new.join_slug, new.presenter_slug)
  on conflict (id) do update set
    owner_id       = excluded.owner_id,
    slug           = excluded.slug,
    output_slug    = coalesce(excluded.output_slug, i.output_slug),
    join_slug      = coalesce(excluded.join_slug, i.join_slug),
    presenter_slug = coalesce(excluded.presenter_slug, i.presenter_slug),
    updated_at     = now();
  return null;
end $$;
revoke all on function public.control_show_record_identity() from public, anon, authenticated;

-- Dropped first so a re-apply is a no-op; net, the same trigger with one more column in its list,
-- which is why `db-push` reads the pair as a replacement rather than a removal.
drop trigger if exists control_shows_record_identity on public.control_shows;
create trigger control_shows_record_identity
  after insert or update of slug, output_slug, join_slug, presenter_slug, owner_id on public.control_shows
  for each row execute function public.control_show_record_identity();
