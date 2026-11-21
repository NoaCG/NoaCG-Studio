\pset format unaligned
\pset tuples_only on
\pset fieldsep '|'
select to_char(clock_timestamp(), 'HH24:MI:SS.MS'), a.pid, coalesce(a.wait_event_type,'cpu'), coalesce(a.wait_event,'-'),
       round(extract(epoch from clock_timestamp() - a.query_start) * 1000), coalesce(array_to_string(pg_blocking_pids(a.pid), ','), ''),
       coalesce((regexp_match(a.query, '"public"\."([a-z_0-9]+)"'))[1], (regexp_match(a.query, 'public\.([a-z_0-9]+)'))[1], left(regexp_replace(a.query, '\s+', ' ', 'g'), 50)),
       coalesce((select coalesce(b.wait_event_type,'cpu') || ':' || coalesce(b.wait_event,'-') || ':' || b.state || ':' ||
                        coalesce((regexp_match(b.query, '"public"\."([a-z_0-9]+)"'))[1], (regexp_match(b.query, 'public\.([a-z_0-9]+)'))[1], left(b.query, 40))
                   from pg_stat_activity b where b.pid = (pg_blocking_pids(a.pid))[1]), '')
  from pg_stat_activity a
 where a.state = 'active' and a.backend_type = 'client backend' and a.pid <> pg_backend_pid()
   and a.datname = 'postgres' and a.usename not in ('supabase_admin') and a.query not like 'select to_char(clock_timestamp()%' \watch 0.1
