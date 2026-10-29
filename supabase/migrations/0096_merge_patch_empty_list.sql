-- THE PLPGSQL ANSWER TO A NEW MERGE-PATCH CASE (docs/work-specs/data-sources/spec.md, phase C1a).
--
-- scripts/merge-patch-conformance.mjs is the one written statement of the production-data write
-- rules, answered by both implementations. 0048 embedded the table as it stood and is applied
-- history, so a case added later is answered here, by CALLING the same bodies again:
-- scripts/production-data-migration.test.mjs fails the build unless 0048's cases and this file's,
-- in that order, are the table case for case.
--
-- The case: a list adapter writes "" when a valid read has no rows, so an emptied list clears on
-- air. A list stored as an array is replaced by the empty string, and the empty string resolves to
-- a field value ("" writes, unlike an empty array, which `production_data_format` skips).
--
-- A self-check only: no table, column, function, grant or row changes. Revert: none needed.

set lock_timeout = '2s';
set statement_timeout = '30s';

do $$
declare
  v_cases jsonb := $cases$[
    {"name":"an empty string replaces a list, so an emptied list clears","base":{"sheet":{"s1":{"lines":["United win","Polls close"]}}},"patch":{"sheet":{"s1":{"lines":""}}},"expect":{"sheet":{"s1":{"lines":""}}}}
  ]$cases$::jsonb;
  v_case jsonb;
  v_got jsonb;
begin
  for v_case in select value from jsonb_array_elements(v_cases) loop
    v_got := public.jsonb_merge_patch(v_case->'base', v_case->'patch');
    if v_got is distinct from (v_case->'expect') then
      raise exception 'merge-patch conformance failed: % - got %, expected %',
        v_case->>'name', v_got, v_case->'expect';
    end if;
  end loop;

  if public.production_data_format('""'::jsonb) is distinct from '' then
    raise exception 'production_data_format must write an empty string, which clears the field';
  end if;
end;
$$;
