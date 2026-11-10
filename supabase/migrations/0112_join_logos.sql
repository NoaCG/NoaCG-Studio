-- The phone page's logo (interaction spec, "Joining" ▸ Logo; AC-6; phase 2).
--
-- A production's look carries one logo, as a data URL inside the synced record. The join page is a
-- phone on venue wifi that re-reads the join state every few seconds, so the logo cannot ride in
-- that state: it is published once to a PUBLIC bucket, at a path named by the production and the
-- file's hash, and the join state carries only its URL (written through `audience_set_join`'s
-- existing `brand` key, no change there). A new logo is a new path, so a phone's next read shows it;
-- removing the logo clears the URL.
--
--   join-logos/<owner uid>/<production id>/<sha-256 of the source file>.<png|jpg|webp|gif>
--
-- Public READ is the bucket's public flag: anyone holding the URL can load it, as anyone holding
-- the join link can see the page. There is NO select, update or delete policy, so nobody can list
-- the bucket through the API and an object, once written, never changes under its hash. The one
-- write is a signed-in user's INSERT into their own folder. Raster images only,
-- at most 300 KB (the brand's own cap, model/brand.ts MAX_BRAND_LOGO_BYTES): an SVG logo is drawn
-- to PNG in the browser before upload, so no script-capable file is ever served from here.
--
-- Additive: a new bucket, its quota row (0039's restrictive quota policy covers it by bucket id)
-- and one policy. No function is added or changed, so the advisor baseline is unchanged.
-- Revert: delete the policy, the quota row and the bucket (after emptying it).
set lock_timeout = '2s';
set statement_timeout = '30s';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('join-logos', 'join-logos', true, 300000, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

insert into public.storage_quotas (bucket, per_owner_bytes, per_bucket_bytes)
values ('join-logos', 20::bigint * 1024 * 1024, 5::bigint * 1024 * 1024 * 1024)
on conflict (bucket) do nothing;

drop policy if exists "join_logos_owner_insert" on storage.objects;
create policy "join_logos_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'join-logos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}\.(png|jpg|webp|gif)$'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Self-check: the bucket is public, raster only, capped, and has its one write door.
do $$
begin
  if not exists (
    select 1 from storage.buckets b
    where b.id = 'join-logos' and b.public and b.file_size_limit = 300000
      and not ('image/svg+xml' = any(b.allowed_mime_types))
  ) then
    raise exception '0112 self-check FAILED: the join-logos bucket is missing or not as written';
  end if;
  if not exists (select 1 from pg_policies p
                 where p.schemaname = 'storage' and p.tablename = 'objects'
                   and p.policyname = 'join_logos_owner_insert' and p.cmd = 'INSERT') then
    raise exception '0112 self-check FAILED: the join-logos insert policy is missing';
  end if;
end $$;
