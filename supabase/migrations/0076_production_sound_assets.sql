-- live-path: additive audio-owner stamp on control_shows and a service-only read capability;
-- existing commands, recovery, events and topics remain compatible
-- live-path add: control_output_audio_manifest, control_stamp_audio_owner
set lock_timeout = '2s';
set statement_timeout = '30s';

-- Account and total bucket quotas stay unchanged. Professional sound assets may be 20 MiB.
update storage.buckets set file_size_limit = 20971520 where id = 'user-assets';

-- The publisher uploads under their own uid, including a member republishing a team show.
-- Derive that uid in the database: JSON metadata must never authorize arbitrary private objects.
alter table public.control_shows add column if not exists audio_owner_id uuid;
create or replace function public.control_stamp_audio_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.audio_owner_id := coalesce(auth.uid(),new.owner_id);
  elsif new.output is distinct from old.output or new.audio_owner_id is distinct from old.audio_owner_id then
    new.audio_owner_id := coalesce(auth.uid(),old.audio_owner_id,old.owner_id);
  end if;
  return new;
end;
$$;
revoke all on function public.control_stamp_audio_owner() from public, anon, authenticated;
create trigger control_stamp_audio_owner before insert or update on public.control_shows
for each row execute function public.control_stamp_audio_owner();

create or replace function public.control_output_audio_manifest(p_output_slug text,p_version text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('owner',coalesce(s.audio_owner_id,s.owner_id),'assets',s.output->'soundAssets')
  from public.control_shows s
  where s.output_slug = p_output_slug and s.output->'ver'->>'h' = p_version;
$$;
revoke all on function public.control_output_audio_manifest(text,text) from public, anon, authenticated;
grant execute on function public.control_output_audio_manifest(text,text) to service_role;
