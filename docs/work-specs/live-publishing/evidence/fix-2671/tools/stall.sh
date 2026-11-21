#!/bin/bash
# Holds every command head row for 6 s, every 15 s, for $1 seconds: a stalled commit, made on purpose.
end=$((SECONDS + ${1:-200}))
while [ $SECONDS -lt $end ]; do
  sleep 9
  docker exec supabase_db_noacg-studio-s0 psql -U postgres -qAtc "begin; select 1 from control_heads for update; select pg_sleep(6); commit;" > /dev/null 2>&1
done
