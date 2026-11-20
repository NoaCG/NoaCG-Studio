-- live-path: control_shows.output compresses with lz4 where the server has it; every reader sees the same JSON
--
-- THE PUBLISHED OUTPUT IS WRITTEN AND READ WITH lz4 (#2616,
-- docs/work-specs/live-publishing/evidence/fix-2616.md, rule R4).
--
-- A whole publish writes control_shows.output, 5 MB at 60 graphics, and the column compressed it
-- with pglz, the server's default. lz4 compresses and decompresses several times faster at a
-- slightly larger stored size (measured in the evidence file). Values already stored stay pglz and
-- readable; each changes method on its next write. Every reader (outputs, the OGraf route,
-- control_output_audio_manifest, the 0118 and 0120 functions) sees the same JSON.
--
-- An instance is a Supabase stack, hosted or local, and both are built with lz4. On a Postgres
-- built without it this file stops with "compression method lz4 not supported" and nothing in it
-- applies. SET COMPRESSION rewrites nothing, but takes an ACCESS EXCLUSIVE lock for an instant:
-- the lock_timeout below gives up rather than queue in front of Takes. A dump restored onto a
-- server without lz4 needs `pg_dump --no-toast-compression` (supabase/README.md).
--
-- Revert: `alter table public.control_shows alter column output set compression pglz;` in a new
-- migration. lz4 values already written stay readable on any server built with lz4.

set lock_timeout = '2s';
set statement_timeout = '30s';

alter table public.control_shows alter column output set compression lz4;

do $$
begin
  if (select a.attcompression from pg_attribute a
       where a.attrelid = 'public.control_shows'::regclass and a.attname = 'output') is distinct from 'l' then
    raise exception '0122: control_shows.output does not compress with lz4';
  end if;
end $$;
