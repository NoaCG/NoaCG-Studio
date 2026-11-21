#!/bin/bash
# Time small commits while big writes run in another session. $1 = db container.
DB=$1
( for i in 1 2 3 4 5 6; do docker exec $DB psql -U postgres -qAtc "insert into diag_w(b) select string_agg(md5(random()::text),'') from generate_series(1,40000)"; done ) &
BIG=$!
sleep 0.3
for i in $(seq 1 15); do printf "insert into diag_w(b) values('x');\nselect pg_sleep(0.2);\n"; done > /tmp/walprobe.sql
docker exec -i $DB psql -U postgres -qAt -c '\timing on' -f - < /tmp/walprobe.sql 2>&1 | grep Time | awk 'NR%2==1 {printf "%s ", $2}'
echo
wait $BIG
