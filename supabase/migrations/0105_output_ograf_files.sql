-- live-path: two new service-only control_* reads of a published imported OGraf package; no table, policy, grant on an existing object or existing function changes
--
-- AN IMPORTED OGRAF PACKAGE ON THE OUTPUTS (docs/work-specs/playout-ograf-rundown/spec.md, E3.2a).
--
-- A stranger's package is a Web Component whose module graph and `import.meta.url` need a real
-- http(s) URL inside the package (docs/OGRAF_ECOSYSTEM.md §3), so the output cannot load it from the
-- data URLs its payload holds. Publish now carries the package's files in the payload, beside the
-- graphic's `ograf` record (src/control/hostedControl.ts), and the output asks the server for a
-- package base (api/_lib/outputOgraf.ts): one POST with the output capability, answered with an
-- opaque, sealed URL that names neither the output nor the production, and every file the frame
-- loads is read through it. These two reads are all that route asks of the database:
--
--   * control_output_ograf_show(slug, version, revision): the production behind an output
--     capability, when the PUBLISHED version it names holds a graphic of that package revision.
--   * control_output_ograf_file(show, slug, revision, path): one file of that package, as the data
--     URL the current payload holds, or null. Read from the payload as it is NOW, and only while the
--     production is still published under the output capability the base was issued for and hosted
--     control is not switched off for its owner: a republish that drops the package, a rotated or
--     removed capability, or a suspension stops this read at once (a file already fetched may stay
--     in a cache for up to the hour its response allows); a republish that keeps it keeps its files
--     reachable under the same base.
--
-- Both are SECURITY DEFINER, service_role only: no client calls them. Additive: two new functions.
-- Revert: drop both; the route then answers 503 and a foreign graphic does not mount (said there).

set lock_timeout = '2s';
set statement_timeout = '30s';

create or replace function public.control_output_ograf_show(p_output_slug text, p_version text, p_revision text)
returns uuid language sql stable security definer set search_path = '' as $$
  select s.id
    from public.control_shows s
   where s.output_slug = p_output_slug and p_output_slug is not null
     and s.output->'ver'->>'h' = p_version
     and p_revision ~ '^[0-9a-f]{64}$'
     and exists (
       select 1 from jsonb_array_elements(case when jsonb_typeof(s.output->'graphics') = 'array' then s.output->'graphics' else '[]'::jsonb end) g
        where g->'ograf'->>'revision' = p_revision);
$$;
revoke all on function public.control_output_ograf_show(text, text, text) from public, anon, authenticated;
grant execute on function public.control_output_ograf_show(text, text, text) to service_role;

create or replace function public.control_output_ograf_file(p_show uuid, p_output_slug text, p_revision text, p_path text)
returns text language sql stable security definer set search_path = '' as $$
  select a->>'data'
    from public.control_shows s,
         jsonb_array_elements(case when jsonb_typeof(s.output->'graphics') = 'array' then s.output->'graphics' else '[]'::jsonb end) g,
         jsonb_array_elements(case when jsonb_typeof(g->'assets') = 'array' then g->'assets' else '[]'::jsonb end) a
   where s.id = p_show
     and s.output_slug = p_output_slug and p_output_slug is not null
     and not public.feature_denied_for(s.owner_id, 'control.hosted')
     and g->'ograf'->>'revision' = p_revision
     and a->>'path' = p_path
   limit 1;
$$;
revoke all on function public.control_output_ograf_file(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.control_output_ograf_file(uuid, text, text, text) to service_role;

-- ── Self-check: grants, then behaviour on a throwaway production, always rolled back ──────────
do $$
declare
  v_user uuid := gen_random_uuid();
  v_show uuid := '00000000-0105-4000-8000-000000000105';
  v_rev text := repeat('a', 64);
begin
  if has_function_privilege('anon', 'public.control_output_ograf_show(text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.control_output_ograf_show(text,text,text)', 'execute')
     or has_function_privilege('anon', 'public.control_output_ograf_file(uuid,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.control_output_ograf_file(uuid,text,text,text)', 'execute')
     or not has_function_privilege('service_role', 'public.control_output_ograf_show(text,text,text)', 'execute')
     or not has_function_privilege('service_role', 'public.control_output_ograf_file(uuid,text,text,text)', 'execute') then
    raise exception '0105 self-check failed: the reads have the wrong grants';
  end if;

  begin
    begin
      insert into auth.users (id, instance_id, aud, role, email)
      values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '0105-self-check@noacg.invalid');
    exception when others then
      raise notice '0105 self-check: no throwaway account could be made (%), skipping the behavioural half', sqlerrm;
      return;
    end;
    insert into public.control_shows (id, owner_id, title, output_slug, output)
      values (v_show, v_user, '0105 self-check', '0105-self-check-output',
              jsonb_build_object('v', 1, 'ver', jsonb_build_object('n', 1, 'h', 'v1'), 'graphics', jsonb_build_array(
                jsonb_build_object('key', 'Native', 'assets', jsonb_build_array(jsonb_build_object('path', 'graphic.mjs', 'data', 'data:,native'))),
                jsonb_build_object('key', 'Pkg', 'ograf', jsonb_build_object('revision', v_rev),
                  'assets', jsonb_build_array(jsonb_build_object('path', 'graphic.mjs', 'data', 'data:,pkg'))))));
    if public.control_output_ograf_show('0105-self-check-output', 'v1', v_rev) is distinct from v_show
       or public.control_output_ograf_show('0105-self-check-output', 'v0', v_rev) is not null
       or public.control_output_ograf_show('0105-self-check-output', 'v1', repeat('b', 64)) is not null
       or public.control_output_ograf_show(null, 'v1', v_rev) is not null then
      raise exception '0105 self-check failed: the show read';
    end if;
    if public.feature_denied_for(v_user, 'control.hosted') then
      raise notice '0105 self-check: hosted control is switched off on this instance, skipping the file half';
      raise exception '0105 self-check passed';
    end if;
    if public.control_output_ograf_file(v_show, '0105-self-check-output', v_rev, 'graphic.mjs') is distinct from 'data:,pkg'
       or public.control_output_ograf_file(v_show, '0105-self-check-output', v_rev, '../graphic.mjs') is not null
       or public.control_output_ograf_file(v_show, '0105-self-check-output', repeat('b', 64), 'graphic.mjs') is not null
       or public.control_output_ograf_file(v_show, 'another-output', v_rev, 'graphic.mjs') is not null
       or public.control_output_ograf_file(v_show, null, v_rev, 'graphic.mjs') is not null then
      raise exception '0105 self-check failed: the file read';
    end if;
    -- A rotated capability revokes the bases issued under the old one.
    update public.control_shows set output_slug = '0105-self-check-rotated' where id = v_show;
    if public.control_output_ograf_file(v_show, '0105-self-check-output', v_rev, 'graphic.mjs') is not null then
      raise exception '0105 self-check failed: a rotated capability still reads';
    end if;
    raise exception '0105 self-check passed';
  exception when others then
    if sqlerrm <> '0105 self-check passed' then raise; end if;
  end;
end $$;
