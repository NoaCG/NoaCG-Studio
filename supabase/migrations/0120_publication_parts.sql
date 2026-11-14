-- live-path: two columns on control_shows, two new control_* tables (one keyed to control_shows by a foreign key, which locks it for an instant) and new control_* functions; no existing function, policy, trigger or grant changes
--
-- PUBLICATIONS IN PARTS (docs/work-specs/live-publishing/designs/G4.md sections 3 to 7).
--
-- A publish sends only what changed: graphics as content-named PARTS (each stored once per
-- production under the digest of its whole body), images as content-named rows stored once, and
-- the rest of the payload (the HEAD: cues, settings, the stamp, and each graphic as a reference) as
-- a patch against the stored head. The server still writes `output` whole with every image inline,
-- so every reader of `output` (outputs built before this, the OGraf package route, the 0118
-- triggers) works unchanged. New outputs read the head, then only the parts and images they lack.
--
--   control_parts            (show, digest) -> a graphic with its images as {h: <content name>}
--   control_assets           content name -> the image's data URL, once
--   published_head           the head; current only while its ver.n is published_ver's n
--   published_units          the unit maps of the head (without ver) and the panel, with their n
--
-- Clients have no privilege on either table and neither has a policy: every read and write goes
-- through the functions here, which run with the owner's rights and check the caller first
-- (`control_may_publish`, the row's own policies' expression) or the output's slug.
--
-- control_publish_parts runs with the caller's rights: its one write to control_shows is an
-- ordinary UPDATE, the last statement before the prune, so the row policies, the 0115 guard and the
-- 0118 triggers act on it as on today's publish, and it is the only statement that locks the row
-- (FOR NO KEY UPDATE, which a Take's KEY SHARE passes, 0071).
--
-- Installing this changes nothing visible: nothing calls these functions until a page reads
-- `partial_writes_state()` (0119) with the switch on, and `control_output_head` answers no head
-- while it is off. Revert: unschedule `noacg-prune-control-assets`, drop the functions, the two
-- tables and the two columns.

set lock_timeout = '2s';
set statement_timeout = '30s';

alter table public.control_shows add column if not exists published_head jsonb;
alter table public.control_shows add column if not exists published_units jsonb;

create table if not exists public.control_assets (
  hash       text primary key,
  data       text not null,
  bytes      int not null,
  created_at timestamptz not null default now()
);
alter table public.control_assets enable row level security;
revoke all on table public.control_assets from public, anon, authenticated;

create table if not exists public.control_parts (
  show_id    uuid not null,
  digest     text not null,
  body       jsonb not null,
  assets     text[] not null default '{}',
  created_at timestamptz not null default now(),
  left_at    timestamptz,
  primary key (show_id, digest)
);
alter table public.control_parts enable row level security;
revoke all on table public.control_parts from public, anon, authenticated;
create index if not exists control_parts_assets on public.control_parts using gin (assets);
alter table public.control_parts drop constraint if exists control_parts_show_fk;
alter table public.control_parts add constraint control_parts_show_fk
  foreign key (show_id) references public.control_shows(id) on delete cascade;

-- May the caller publish this production: the expression of control_shows_owner_all (0063) and the
-- restrictive update policies (0020, 0022).
create or replace function public.control_may_publish(p_show uuid)
returns boolean
language sql security definer set search_path = '' stable as $$
  select (select auth.uid()) is not null
     and not public.is_suspended()
     and not public.feature_denied('control.hosted')
     and exists (
       select 1 from public.control_shows s
        where s.id = p_show
          and case when s.team_id is null then (select auth.uid()) = s.owner_id
                   else public.is_team_member(s.team_id) end);
$$;
revoke all on function public.control_may_publish(uuid) from public, anon, authenticated;

-- An image, stored once under the content name the server computes.
create or replace function public.control_asset_put(p_show uuid, p_data text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
begin
  if not public.control_may_publish(p_show) then
    raise exception 'This account cannot publish this production' using errcode = '42501';
  end if;
  if p_data is null or left(p_data, 5) <> 'data:' or position(';base64,' in p_data) = 0 then
    raise exception 'an image must be a base64 data URL' using errcode = 'check_violation';
  end if;
  if octet_length(p_data) > 40000000 then
    raise exception 'this image is too large to publish' using errcode = 'check_violation';
  end if;
  v_hash := encode(extensions.digest(convert_to(p_data, 'UTF8'), 'sha256'), 'hex');
  insert into public.control_assets (hash, data, bytes) values (v_hash, p_data, octet_length(p_data))
  on conflict (hash) do update set created_at = now();
  return v_hash;
end $$;
revoke all on function public.control_asset_put(uuid, text) from public, anon, authenticated;
grant execute on function public.control_asset_put(uuid, text) to authenticated;

-- Which of these images no part of a production the caller may publish names (and so must be put).
create or replace function public.control_assets_missing(p_show uuid, p_hashes text[])
returns text[]
language plpgsql security definer set search_path = '' stable as $$
begin
  if not public.control_may_publish(p_show) then
    raise exception 'This account cannot publish this production' using errcode = '42501';
  end if;
  return coalesce((
    select array_agg(h) from unnest(coalesce(p_hashes, '{}')) h
     where not exists (
       select 1 from public.control_parts p
         join public.control_assets a on a.hash = h
        where p.assets @> array[h]
          and (p.show_id = p_show or public.control_may_publish(p.show_id)))), '{}');
end $$;
revoke all on function public.control_assets_missing(uuid, text[]) from public, anon, authenticated;
grant execute on function public.control_assets_missing(uuid, text[]) to authenticated;

-- The parts a publish brings, stored. Answers the images they name that are not stored (nothing is
-- written then). Locks (KEY SHARE) every image row named, so the daily prune cannot remove one
-- before the publish names it.
create or replace function public.control_parts_put(p_show uuid, p_parts jsonb, p_named text[] default '{}')
returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_named   text[];
  v_have    text[];
  v_missing text[];
begin
  if not public.control_may_publish(p_show) then
    raise exception 'This account cannot publish this production' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct h), '{}') into v_named
    from jsonb_array_elements(coalesce(p_parts, '[]'::jsonb)) p, jsonb_array_elements_text(coalesce(p->'assets', '[]'::jsonb)) h;
  select coalesce(array_agg(a.hash), '{}') into v_have
    from (select a.hash from public.control_assets a where a.hash = any(v_named) for key share) a;
  select coalesce(array_agg(h), '{}') into v_missing from unnest(v_named) h where not (h = any(v_have));
  if cardinality(v_missing) > 0 then return v_missing; end if;
  -- A digest already stored must name exactly the body sent (G4 R23): otherwise refuse, and the
  -- publisher publishes whole.
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_parts, '[]'::jsonb)) p
      join public.control_parts c on c.show_id = p_show and c.digest = p->>'d'
     where c.body is distinct from p->'body') then
    return array['refused'];
  end if;
  -- The stored parts the new head names, held (KEY SHARE) so the daily prune cannot remove one.
  perform 1 from public.control_parts c where c.show_id = p_show and c.digest = any(coalesce(p_named, '{}')) for key share;
  -- Stored as not named yet: a part no landed head ever names is pruned like one that left.
  insert into public.control_parts (show_id, digest, body, assets, left_at)
  select p_show, p->>'d', p->'body', coalesce(array(select jsonb_array_elements_text(coalesce(p->'assets', '[]'::jsonb))), '{}'), now()
    from jsonb_array_elements(coalesce(p_parts, '[]'::jsonb)) p
   where jsonb_typeof(p->'d') = 'string' and jsonb_typeof(p->'body') = 'object'
  on conflict (show_id, digest) do nothing;
  return '{}';
end $$;
revoke all on function public.control_parts_put(uuid, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.control_parts_put(uuid, jsonb, text[]) to authenticated;

-- A part with its images back inline: what `output.graphics[i]` holds.
create or replace function public.control_part_inline(p_body jsonb)
returns jsonb
language sql security definer set search_path = '' stable as $$
  select p_body || jsonb_build_object('assets', coalesce((
    select jsonb_agg(case when jsonb_typeof(x->'h') = 'string'
                          then (x - 'h') || jsonb_build_object('data', (select a.data from public.control_assets a where a.hash = x->>'h'))
                          else x end order by i)
      from jsonb_array_elements(coalesce(p_body->'assets', '[]'::jsonb)) with ordinality t(x, i)), '[]'::jsonb));
$$;
revoke all on function public.control_part_inline(jsonb) from public, anon, authenticated;

-- The whole inline `graphics` array a head names, or null when a reference names no stored part.
create or replace function public.control_compose_graphics(p_show uuid, p_refs jsonb)
returns jsonb
language plpgsql security definer set search_path = '' stable as $$
declare
  v_missing int;
  v_out     jsonb;
begin
  if not public.control_may_publish(p_show) then
    raise exception 'This account cannot publish this production' using errcode = '42501';
  end if;
  select count(*) into v_missing
    from jsonb_array_elements(coalesce(p_refs, '[]'::jsonb)) r
   where not exists (select 1 from public.control_parts p where p.show_id = p_show and p.digest = r->>'p');
  if v_missing > 0 then return null; end if;
  select coalesce(jsonb_agg(public.control_part_inline(p.body) order by i), '[]'::jsonb) into v_out
    from jsonb_array_elements(coalesce(p_refs, '[]'::jsonb)) with ordinality t(r, i)
    join public.control_parts p on p.show_id = p_show and p.digest = r->>'p';
  return v_out;
end $$;
revoke all on function public.control_compose_graphics(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.control_compose_graphics(uuid, jsonb) to authenticated;

-- After a publish landed: which parts the head names. Nothing is deleted here (the daily job does).
create or replace function public.control_parts_settle(p_show uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_refs text[];
begin
  if not public.control_may_publish(p_show) then return; end if;
  select coalesce(array_agg(r->>'p'), '{}') into v_refs
    from public.control_shows s, jsonb_array_elements(coalesce(s.published_head->'graphics', '[]'::jsonb)) r
   where s.id = p_show;
  update public.control_parts p set left_at = null where p.show_id = p_show and p.digest = any(v_refs) and p.left_at is not null;
  update public.control_parts p set left_at = now() where p.show_id = p_show and not (p.digest = any(v_refs)) and p.left_at is null;
end $$;
revoke all on function public.control_parts_settle(uuid) from public, anon, authenticated;
grant execute on function public.control_parts_settle(uuid) to authenticated;

-- ONE PUBLISH IN PARTS. Caller's rights: the final UPDATE is under the row policies, the 0115 guard
-- and the 0118 triggers. Answers {landed, n} or the reason, writing nothing for a reason.
--   p_head   {"whole": <head without ver>, "units": <map>} or {"ops": [...]}
--   p_panel  {"whole": <panel array>, "units": <map>} or {"ops": [...]}, or null to keep the panel
--   p_parts  [{"d": digest, "body": part, "assets": [content names]}]
--   p_ver    the stamp without g and t (built here from the head's references)
--   p_columns  any of title, bindings, sources, collections, profile, team_id
-- A landed answer carries the join page's brand as stored (audience_state.brand, 0035), which the
-- page compares with its own as every full publish does.
create or replace function public.control_publish_parts(
  p_id uuid, p_named_n bigint, p_ver jsonb, p_head jsonb, p_panel jsonb, p_parts jsonb, p_columns jsonb)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_row      record;
  v_missing  text[];
  v_valid    boolean;
  v_head     jsonb;
  v_hmap     jsonb;
  v_panel    jsonb;
  v_pmap     jsonb;
  v_ver      jsonb;
  v_refs     jsonb;
  v_graphics jsonb;
  v_output   jsonb;
  v_n        int;
  v_cols     jsonb := coalesce(p_columns, '{}'::jsonb);
begin
  -- 1. Parts (and below, once the head is known, the stored ones it names are held).
  v_missing := public.control_parts_put(p_id, p_parts);
  if v_missing = array['refused'] then
    return jsonb_build_object('refused', true);
  end if;
  if cardinality(v_missing) > 0 then
    return jsonb_build_object('missing_assets', to_jsonb(v_missing));
  end if;

  -- 2. Head and panel, read without a lock.
  select s.published_ver, s.published_head, s.published_units, s.panel, s.audience_state->'brand' as brand into v_row
    from public.control_shows s where s.id = p_id;
  if not found then return jsonb_build_object('gone', true); end if;
  if (v_row.published_ver->>'n') is distinct from p_named_n::text then
    return jsonb_build_object('moved', true, 'n', v_row.published_ver->'n');
  end if;
  -- The head and maps describe the publication only when the head's whole stamp is the row's.
  v_valid := p_named_n is not null
         and v_row.published_units->>'f' = '1'
         and v_row.published_units->>'n' = p_named_n::text
         and v_row.published_head->'ver' = v_row.published_ver;
  begin
    if p_head ? 'whole' then
      v_head := p_head->'whole';
      v_hmap := p_head->'units';
    elsif v_valid then
      v_head := public.unit_patch_apply(v_row.published_head - 'ver', p_head->'ops');
      v_hmap := public.unit_map_apply(v_row.published_units->'head', p_head->'ops', v_head);
    else
      return jsonb_build_object('replaced', true);
    end if;
    if p_panel is null then
      if not v_valid then return jsonb_build_object('replaced', true); end if;
      v_panel := v_row.panel;
      v_pmap := v_row.published_units->'panel';
    elsif p_panel ? 'whole' then
      v_panel := p_panel->'whole';
      v_pmap := p_panel->'units';
    elsif v_valid then
      v_panel := public.unit_patch_apply(jsonb_build_object('panel', coalesce(v_row.panel, '[]'::jsonb)), p_panel->'ops')->'panel';
      v_pmap := public.unit_map_apply(v_row.published_units->'panel', p_panel->'ops', jsonb_build_object('panel', v_panel));
    else
      return jsonb_build_object('replaced', true);
    end if;
  exception when raise_exception then
    if sqlerrm like 'unit patch refused%' then return jsonb_build_object('replaced', true, 'why', sqlerrm); end if;
    raise;
  end;
  if jsonb_typeof(v_head) is distinct from 'object' then return jsonb_build_object('replaced', true); end if;

  -- 3. References, held against the prune, and the stamp's per-graphic members built from them.
  v_refs := coalesce(v_head->'graphics', '[]'::jsonb);
  perform public.control_parts_put(p_id, '[]'::jsonb, array(select r->>'p' from jsonb_array_elements(v_refs) r));
  v_ver := p_ver || jsonb_build_object(
    'g', coalesce((select jsonb_object_agg(r->>'key', r->'g') from jsonb_array_elements(v_refs) r), '{}'::jsonb))
    -- `t` always, `{}` when no reference carries one, as the page's stamp writes it.
    || jsonb_build_object('t', coalesce((select jsonb_object_agg(r->>'key', r->'t') from jsonb_array_elements(v_refs) r where r ? 't'), '{}'::jsonb));
  v_head := v_head || jsonb_build_object('ver', v_ver);

  -- 4. Compose output.
  if v_valid and not (p_head ? 'whole') and v_refs = coalesce(v_row.published_head->'graphics', '[]'::jsonb) then
    select (v_head - 'graphics') || jsonb_build_object('graphics', s.output->'graphics') into v_output
      from public.control_shows s where s.id = p_id;
  else
    v_graphics := public.control_compose_graphics(p_id, v_refs);
    if v_graphics is null then
      return jsonb_build_object('missing_parts', true);
    end if;
    v_output := (v_head - 'graphics') || jsonb_build_object('graphics', v_graphics);
  end if;

  -- 5. Write: the only statement that locks the row.
  update public.control_shows s
     set output = v_output,
         panel = v_panel,
         published_head = v_head,
         published_units = jsonb_build_object('f', 1, 'n', v_ver->'n', 'head', v_hmap, 'panel', v_pmap),
         title = case when v_cols ? 'title' then v_cols->>'title' else s.title end,
         bindings = case when v_cols ? 'bindings' then v_cols->'bindings' else s.bindings end,
         sources = case when v_cols ? 'sources' then v_cols->'sources' else s.sources end,
         collections = case when v_cols ? 'collections' then v_cols->'collections' else s.collections end,
         profile = case when v_cols ? 'profile' then v_cols->'profile' else s.profile end,
         team_id = case when v_cols ? 'team_id' then (v_cols->>'team_id')::uuid else s.team_id end
   where s.id = p_id
     and (s.published_ver->>'n') is not distinct from p_named_n::text;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('moved', true);
  end if;

  -- 6. Mark which parts the landed head names (the daily job deletes).
  perform public.control_parts_settle(p_id);
  -- What phones read as the join page's brand, so the page compares it with its own after the
  -- publish (as today's publish reads it) without asking again.
  -- And what a press's publish reads back today (the slugs, whether phones have a page) and the
  -- revision published, so the page asks nothing more once it lands (G4 section 11).
  return (select jsonb_build_object('landed', true, 'n', v_ver->'n', 'brand', v_row.brand,
            'published_rev', s.published_rev,
            'slug', s.slug, 'output_slug', s.output_slug, 'join_slug', s.join_slug,
            'presenter_slug', s.presenter_slug, 'audience', s.audience_state is not null)
            from public.control_shows s where s.id = p_id);
end $$;
revoke all on function public.control_publish_parts(uuid, bigint, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.control_publish_parts(uuid, bigint, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- An output's head read: control_output_resolve (0071) with the head in place of the payload. No
-- head while the switch is off or while the head is not the publication's.
create or replace function public.control_output_head(p_output_slug text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_s    record;
  v_h    public.control_heads%rowtype;
  v_live jsonb;
begin
  select s.id, s.title, s.live, s.published_ver, s.published_head into v_s
    from public.control_shows s where s.output_slug = p_output_slug and p_output_slug is not null;
  if v_s.id is null then return null; end if;
  select * into v_h from public.control_heads h where h.show_id = v_s.id;
  v_live := public.control_live_merged(v_s.live, v_h.live);
  return jsonb_build_object(
    'proto', 2,
    'id', v_s.id, 'title', v_s.title,
    'head', case when public.partial_writes_on()
                  and v_s.published_head->'ver' is not null
                  and v_s.published_head->'ver' = v_s.published_ver
                 then v_s.published_head end,
    'live', public.control_live_seq(v_s.id, v_live, coalesce(v_h.seq, 0)),
    'last_event_id', coalesce((select max(e.id) from public.control_events e where e.show_id = v_s.id), 0),
    'epoch', v_h.epoch, 'seq', coalesce(v_h.seq, 0), 'graphics', coalesce(v_h.graphics, '{}'::jsonb),
    'legacy', public.control_head_legacy(v_s.id, v_live));
end $$;
revoke all on function public.control_output_head(text) from public, anon, authenticated;
grant execute on function public.control_output_head(text) to anon, authenticated;

-- The parts an output asks for, of its own production only.
create or replace function public.control_output_parts(p_output_slug text, p_digests text[])
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(p.digest, p.body), '{}'::jsonb)
    from public.control_shows s
    join public.control_parts p on p.show_id = s.id
   where s.output_slug = p_output_slug and p_output_slug is not null
     and p.digest = any(coalesce(p_digests, '{}'));
$$;
revoke all on function public.control_output_parts(text, text[]) from public, anon, authenticated;
grant execute on function public.control_output_parts(text, text[]) to anon, authenticated;

-- The images an output asks for, only those a part of its production names, at most about 8 MB
-- per answer: what did not fit is listed in `more`, to ask again.
create or replace function public.control_output_assets(p_output_slug text, p_hashes text[])
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_show  uuid;
  v_out   jsonb := '{}'::jsonb;
  v_more  text[] := '{}';
  v_bytes bigint := 0;
  v_row   record;
begin
  select s.id into v_show from public.control_shows s where s.output_slug = p_output_slug and p_output_slug is not null;
  if v_show is null then return null; end if;
  for v_row in
    select a.hash, a.data, a.bytes
      from public.control_assets a
     where a.hash = any(coalesce(p_hashes, '{}'))
       and exists (select 1 from public.control_parts p where p.show_id = v_show and p.assets @> array[a.hash])
     order by a.hash
  loop
    if v_bytes > 0 and v_bytes + v_row.bytes > 8388608 then
      v_more := v_more || v_row.hash;
    else
      v_out := v_out || jsonb_build_object(v_row.hash, v_row.data);
      v_bytes := v_bytes + v_row.bytes;
    end if;
  end loop;
  return jsonb_build_object('assets', v_out, 'more', to_jsonb(v_more));
end $$;
revoke all on function public.control_output_assets(text, text[]) from public, anon, authenticated;
grant execute on function public.control_output_assets(text, text[]) to anon, authenticated;

-- The daily prune. Parts no landed head has named for an hour, locked and deleted in one statement
-- (a publish holds KEY SHARE on the parts its head names, so those are skipped, and a part a publish
-- named meanwhile has its left_at cleared, which the lock re-reads). Then images no part names,
-- older than a day, in two statements: lock the candidates
-- (rows a publish holds are skipped), then, in a fresh snapshot, delete those that still no part
-- names. A publish that committed a part after the first statement's snapshot is seen by the second,
-- and a publish that wants a locked row waits for this job, then finds it gone and sends it again.
create or replace function public.control_assets_prune()
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_locked text[];
  v_n      int;
begin
  -- Parts no head has named for an hour first, so the images only they named go in the same run.
  delete from public.control_parts p
   using (select c.show_id, c.digest from public.control_parts c
           where c.left_at < now() - interval '1 hour'
           for update skip locked) gone
   where p.show_id = gone.show_id and p.digest = gone.digest
     and p.left_at < now() - interval '1 hour';
  select coalesce(array_agg(c.hash), '{}') into v_locked
    from (select a.hash from public.control_assets a
           where a.created_at < now() - interval '1 day'
             and not exists (select 1 from public.control_parts p where p.assets @> array[a.hash])
           for update skip locked) c;
  delete from public.control_assets a
   where a.hash = any(v_locked)
     and not exists (select 1 from public.control_parts p where p.assets @> array[a.hash]);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.control_assets_prune() from public, anon, authenticated;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'noacg-prune-control-assets';
  if v_job is not null then perform cron.unschedule(v_job); end if;
end $$;
select cron.schedule('noacg-prune-control-assets', '41 3 * * *', $$select public.control_assets_prune()$$);

-- Self-check: privileges always; a publish in parts, a patch over it, a stale head and a refused
-- part name on a throwaway production when an account exists (0118's pattern), undone by a
-- sentinel the block catches.
do $$
declare
  v_owner uuid;
  v_show  uuid := '00000000-0120-4000-8000-000000000001';
  v_slug  text;
  v_hash  text;
  v_part  jsonb;
  v_got   jsonb;
  v_n     int;
begin
  if has_table_privilege('anon', 'public.control_parts', 'select') or has_table_privilege('authenticated', 'public.control_parts', 'select')
     or has_table_privilege('authenticated', 'public.control_parts', 'insert')
     or has_table_privilege('anon', 'public.control_assets', 'select') or has_table_privilege('authenticated', 'public.control_assets', 'select')
     or has_table_privilege('authenticated', 'public.control_assets', 'insert') then
    raise exception '0120: a client role holds a privilege on control_parts or control_assets';
  end if;
  if has_function_privilege('authenticated', 'public.control_may_publish(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.control_part_inline(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.control_assets_prune()', 'EXECUTE')
     or has_function_privilege('anon', 'public.control_publish_parts(uuid, bigint, jsonb, jsonb, jsonb, jsonb, jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.control_asset_put(uuid, text)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.control_output_head(text)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.control_output_parts(text, text[])', 'EXECUTE')
     or not has_function_privilege('anon', 'public.control_output_assets(text, text[])', 'EXECUTE') then
    raise exception '0120: EXECUTE on a parts function is wrong for a client role';
  end if;

  select id into v_owner from auth.users limit 1;
  if v_owner is null then
    raise notice '0120 self-check skipped: no account on this instance';
    return;
  end if;
  begin
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    insert into public.system_settings (key, value) values ('partial_writes', '{"on": true}')
    on conflict (key) do update set value = excluded.value;
    insert into public.control_shows (id, owner_id, title, output) values (v_show, v_owner, '0120 self-check', '{"v":1,"ver":{"n":1,"h":"h1"}}');
    select s.output_slug into v_slug from public.control_shows s where s.id = v_show;
    -- An image, stored once under the name the server computes.
    v_hash := public.control_asset_put(v_show, 'data:image/png;base64,AAAA');
    if v_hash <> encode(extensions.digest(convert_to('data:image/png;base64,AAAA', 'UTF8'), 'sha256'), 'hex')
       or public.control_asset_put(v_show, 'data:image/png;base64,AAAA') <> v_hash
       or (select count(*) from public.control_assets a where a.hash = v_hash) <> 1 then
      raise exception '0120: an image was not stored once under its content name';
    end if;
    if cardinality(public.control_assets_missing(v_show, array[v_hash, 'nope'])) <> 2 then
      raise exception '0120: an image no part names did not read as missing';
    end if;
    -- A whole head: output composed whole, images inline, the head current.
    v_part := jsonb_build_object('key', 'A', 'html', '<p></p>', 'assets', jsonb_build_array(jsonb_build_object('path', 'a.png', 'h', v_hash)));
    v_got := public.control_publish_parts(v_show, 1, '{"n":2,"h":"h2","at":"t"}',
      jsonb_build_object('whole', jsonb_build_object('v', 1, 'cues', '[{"id":"c","label":"one"}]'::jsonb, 'graphics', jsonb_build_array(jsonb_build_object('key', 'A', 'p', 'pA', 'g', 'gA'))),
                         'units', '{"f":1,"m":{"v":"d1","cues":{"by":"id","order":["c"],"d":{"c":"dc"}},"graphics":{"by":"key","order":["A"],"d":{"A":"dA"}}}}'::jsonb),
      '{"whole":[],"units":{"f":1,"m":{}}}', jsonb_build_array(jsonb_build_object('d', 'pA', 'body', v_part, 'assets', jsonb_build_array(v_hash))), '{"title":"0120"}');
    if v_got->>'landed' is distinct from 'true'
       or (select s.output->'graphics'->0->'assets'->0->>'data' from public.control_shows s where s.id = v_show) <> 'data:image/png;base64,AAAA'
       or (select s.output->'ver'->'g'->>'A' from public.control_shows s where s.id = v_show) <> 'gA'
       or (public.control_output_head(v_slug)->'head'->'ver'->>'n') <> '2'
       or (public.control_output_parts(v_slug, array['pA'])->'pA'->'assets'->0->>'h') <> v_hash
       or (public.control_output_assets(v_slug, array[v_hash])->'assets'->>v_hash) <> 'data:image/png;base64,AAAA' then
      raise exception '0120: a whole head answered % or composed wrong', v_got;
    end if;
    -- A patch over it: only the cue moves; the graphics stay.
    v_got := public.control_publish_parts(v_show, 2, '{"n":3,"h":"h2","at":"t"}',
      '{"ops":[{"m":"cues","by":"id","put":[{"v":{"id":"c","label":"two"},"d":"dc2"}],"del":[],"len":1}]}', null, '[]', '{}');
    if v_got->>'landed' is distinct from 'true'
       or (select s.output->'cues'->0->>'label' from public.control_shows s where s.id = v_show) <> 'two'
       or (select s.output->'graphics'->0->'assets'->0->>'data' from public.control_shows s where s.id = v_show) <> 'data:image/png;base64,AAAA' then
      raise exception '0120: a patch answered % or wrote wrong', v_got;
    end if;
    -- A whole publish by an older page: the head is stale, never read as current, never patched.
    update public.control_shows set output = '{"v":1,"ver":{"n":4,"h":"h9"},"graphics":[]}' where id = v_show;
    if public.control_output_head(v_slug)->'head' <> 'null'::jsonb then
      raise exception '0120: a stale head was read as current';
    end if;
    v_got := public.control_publish_parts(v_show, 4, '{"n":5,"h":"h2","at":"t"}', '{"ops":[]}', null, '[]', '{}');
    if v_got->>'replaced' is distinct from 'true' then
      raise exception '0120: a patch over a stale head answered %', v_got;
    end if;
    -- A part name held for another body: refused, nothing written.
    v_got := public.control_publish_parts(v_show, 4, '{"n":5,"h":"h2","at":"t"}', '{"whole":{"graphics":[]},"units":{"f":1,"m":{}}}', '{"whole":[],"units":{"f":1,"m":{}}}',
      jsonb_build_array(jsonb_build_object('d', 'pA', 'body', '{"key":"other"}'::jsonb, 'assets', '[]'::jsonb)), '{}');
    if v_got->>'refused' is distinct from 'true' or (select s.output->'ver'->>'n' from public.control_shows s where s.id = v_show) <> '4' then
      raise exception '0120: a part name held for another body answered %', v_got;
    end if;
    -- Off: no head for outputs.
    update public.system_settings set value = '{"on": false}' where key = 'partial_writes';
    v_got := public.control_publish_parts(v_show, 4, '{"n":5,"h":"h2","at":"t"}', '{"whole":{"v":1,"graphics":[]},"units":{"f":1,"m":{}}}', '{"whole":[],"units":{"f":1,"m":{}}}', '[]', '{}');
    if public.control_output_head(v_slug)->'head' <> 'null'::jsonb then
      raise exception '0120: an output read a head with the switch off';
    end if;
    get diagnostics v_n = row_count;
    raise exception 'self-check-done';
  exception when raise_exception then
    if sqlerrm <> 'self-check-done' then raise; end if;
  end;
end $$;
