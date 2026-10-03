-- live-path: adds the index control_events_show_seq_idx, built concurrently, and control_tail_seq_for reads through it (same signature, same answers)
--
-- A NUMBERED TAIL READ THAT COSTS ITS PAGE, NOT THE PRODUCTION'S LOG
-- (design K4 in docs/work-specs/playout-runtime-reliability/step-2-design.md).
--
-- WHAT WAS WRONG. 0071 numbered the log per production but gave it no (show_id, seq) index,
-- because building one in that file would have scanned control_events under its ACCESS EXCLUSIVE
-- lock on air. So control_tail_seq_for read the newest (gap + 64) rows by id and fell back to a
-- scan of the production's rows when that window was not whole. A follower far behind (a renderer
-- booting from an old baseline, a laptop waking) paid for its whole gap on every 500-row page.
-- Measured on a local stack with two productions of 300,000 rows each: 243 ms for the first page
-- of a renderer 300,000 behind, 110 ms at 150,000, and a parallel scan of the table (25 ms, 9,844
-- buffers) for any page the window could not serve. After this file, on the same log: 6 ms and
-- 4 ms, and the read is an index scan of 27 buffers. The answers were compared at eight cursors on
-- both productions, and across a pruned stretch: identical.
--
-- WHAT THIS ADDS. A partial index on (show_id, seq) for the numbered rows, and a tail that reads
-- its page straight from it: at most 500 rows, whatever the gap. The new body is 0071's own
-- fallback read, which was always the authoritative one (the window was trusted only when it held
-- exactly the rows that read returns), so every answer is the same; only its cost changes. The
-- function is replaced only after the index is proven valid, so until then 0071's path stays.
--
-- ── HOW THIS FILE RUNS, AND WHAT IT LOCKS ON AIR ──────────────────────────────────────────────
-- `create index concurrently` cannot run in a transaction or a pipeline. The Supabase CLI
-- (`supabase db push`, `migration up`, `start`; 2.111 measured) knows that statement: it commits
-- the statements before it, runs it on its own, then runs the rest of the file and the ledger row
-- in one transaction. So this file is three steps, not one transaction:
--   1. the timeouts and the drop of a leftover index (500 ms lock_timeout). On a first apply there is none, and a
--      `drop index if exists` that finds nothing takes no lock at all (measured: it returns at
--      once while another session holds ACCESS EXCLUSIVE on control_events);
--   2. the build. SHARE UPDATE EXCLUSIVE on control_events, which no read, insert, update or
--      delete conflicts with, so no Take waits on it and none queues behind it while it waits.
--      It does wait for transactions already writing the table to finish (milliseconds on the
--      live path), and for older snapshots anywhere in the database, under the 2 s lock_timeout
--      (above the 1 s deadlock_timeout, so an autovacuum in its way is cancelled first);
--   3. the proof that the index is valid, the new function body, the self-check and the ledger
--      row, together. A `create or replace function` takes no lock a caller waits on, and a call
--      already running keeps the body it started with.
-- On a first apply no step holds a lock a renderer or an operator page waits on.
--
-- IF A STEP FAILS. A failed concurrent build leaves an INVALID index of the same name behind, and
-- no ledger row. db-push retries a lock timeout (55P03) twice, and the next landing pushes again;
-- step 1 drops what the failed build left, so every retry builds afresh instead of stopping on
-- the leftover. That drop is the one strong lock this file can take: ACCESS EXCLUSIVE on
-- control_events for the instant of a catalog change, and only on a retry, so it waits at most
-- 500 ms (below the 1 s deadlock_timeout, as 0071's strong lock does). (`drop index concurrently`
-- would avoid even that, but CLI 2.111 runs it inside the file's transaction, where Postgres
-- refuses it.) Until a retry drops it, an invalid leftover costs each insert one index entry and
-- nothing else; nothing reads it. A retry after step 3 failed rebuilds a valid index once more,
-- which costs a scan and nothing else.
set lock_timeout = '500ms';
set statement_timeout = '30s';

drop index if exists public.control_events_show_seq_idx;

-- The build reads the whole table twice; at the 14-day retention a feed writing a row a second
-- keeps about 1.2 million rows (600,000 built in about a second on a local stack). Five minutes
-- bounds it with room, and leaves a retry and the staging push inside post-land's 15-minute job.
-- It blocks nobody while it runs, so its waits get 2 s, above the 1 s deadlock_timeout.
set lock_timeout = '2s';
set statement_timeout = '5min';

create index concurrently control_events_show_seq_idx
  on public.control_events (show_id, seq) where seq is not null;

set lock_timeout = '500ms';
set statement_timeout = '30s';

-- The index must be whole before anything reads through it.
do $$
begin
  if not exists (
    select 1 from pg_index i
     where i.indexrelid = to_regclass('public.control_events_show_seq_idx') and i.indisvalid and i.indisready) then
    raise exception '0074: control_events_show_seq_idx is missing or invalid after its build';
  end if;
end $$;

-- Rows after a seq, in seq order, at most 500, as 0071 defined the answer: authoritative, a gap
-- is a deletion (the prune, a cascade), a different epoch answers `reset`, and every answer in
-- the epoch carries the head. The read is one range of control_events_show_seq_idx.
create or replace function public.control_tail_seq_for(p_show uuid, p_after bigint, p_epoch uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_epoch uuid;
  v_seq bigint;
  v_graphics jsonb;
  v_after bigint := greatest(coalesce(p_after, 0), 0);
  v_rows jsonb;
begin
  select h.epoch, h.seq, h.graphics into v_epoch, v_seq, v_graphics from public.control_heads h where h.show_id = p_show;
  if v_epoch is null then
    return jsonb_build_object('epoch', null, 'rows', '[]'::jsonb, 'reset', p_epoch is not null);
  end if;
  if p_epoch is not null and p_epoch <> v_epoch then
    return jsonb_build_object('epoch', v_epoch, 'rows', '[]'::jsonb, 'reset', true);
  end if;
  if v_seq <= v_after then
    return jsonb_build_object('epoch', v_epoch, 'rows', '[]'::jsonb,
      'head', jsonb_build_object('seq', v_seq, 'graphics', v_graphics));
  end if;
  select coalesce(jsonb_agg(r order by r.seq), '[]'::jsonb) into v_rows
    from (select e.id, e.seq, e.graphic, e.msg, e.created_at
            from public.control_events e
           where e.show_id = p_show and e.seq > v_after
           order by e.seq
           limit 500) r;
  return jsonb_build_object('epoch', v_epoch, 'rows', v_rows,
    'head', jsonb_build_object('seq', v_seq, 'graphics', v_graphics));
end $$;
revoke all on function public.control_tail_seq_for(uuid, bigint, uuid) from public, anon, authenticated;

-- ── Prove it, or refuse to apply ──────────────────────────────────────────────────────────────
-- CALLS the tail on a throwaway production (supabase/AGENTS.md: a self-check proves shape, never
-- behaviour): numbering, order, a cursor inside the log, the head, a prune gap, and `reset`. The
-- rows go in through the ordinary trigger, so they are numbered exactly as a send numbers them.
do $$
declare
  v_owner uuid;
  v_show  uuid := gen_random_uuid();
  v_epoch uuid;
  v_ans   jsonb;
begin
  -- Still internal: only the two tail RPCs reach it.
  if has_function_privilege('anon', 'public.control_tail_seq_for(uuid,bigint,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.control_tail_seq_for(uuid,bigint,uuid)', 'execute') then
    raise exception '0074 self-check failed: a client role can call control_tail_seq_for';
  end if;

  select u.id into v_owner from auth.users u limit 1;
  if v_owner is null then
    raise notice '0074 self-check skipped the call: no account on this instance to own a throwaway production';
    return;
  end if;
  insert into public.control_shows (id, owner_id, title) values (v_show, v_owner, '0074 self-check');
  insert into public.control_events (show_id, graphic, msg) values (v_show, 'Bug', '{"t":"update","data":{"n":1}}');
  insert into public.control_events (show_id, graphic, msg) values (v_show, 'Bug', '{"t":"play"}');
  insert into public.control_events (show_id, graphic, msg) values (v_show, 'Card', '{"t":"update","data":{"n":3}}');
  select h.epoch into v_epoch from public.control_heads h where h.show_id = v_show;

  v_ans := public.control_tail_seq_for(v_show, 0, null);
  if v_ans->'epoch' is distinct from to_jsonb(v_epoch)
     or (select array_agg((r->>'seq')::bigint order by o) from jsonb_array_elements(v_ans->'rows') with ordinality t(r, o)) is distinct from array[1, 2, 3]::bigint[]
     or v_ans->'rows'->2->>'graphic' is distinct from 'Card'
     or (v_ans->'head'->>'seq')::bigint is distinct from 3 then
    raise exception '0074 self-check failed: the tail from 0 answered %', v_ans;
  end if;

  v_ans := public.control_tail_seq_for(v_show, 2, v_epoch);
  if jsonb_array_length(v_ans->'rows') <> 1 or (v_ans->'rows'->0->>'seq')::bigint <> 3 then
    raise exception '0074 self-check failed: the tail after 2 answered %', v_ans;
  end if;

  v_ans := public.control_tail_seq_for(v_show, 3, v_epoch);
  if jsonb_array_length(v_ans->'rows') <> 0 or (v_ans->'head'->>'seq')::bigint <> 3 or v_ans ? 'reset' then
    raise exception '0074 self-check failed: the tail at the head answered %', v_ans;
  end if;

  delete from public.control_events where show_id = v_show and seq = 2;
  v_ans := public.control_tail_seq_for(v_show, 0, v_epoch);
  if (select array_agg((r->>'seq')::bigint order by o) from jsonb_array_elements(v_ans->'rows') with ordinality t(r, o)) is distinct from array[1, 3]::bigint[] then
    raise exception '0074 self-check failed: a pruned row was not read as a gap: %', v_ans;
  end if;

  v_ans := public.control_tail_seq_for(v_show, 0, gen_random_uuid());
  if v_ans->>'reset' is distinct from 'true' or jsonb_array_length(v_ans->'rows') <> 0 then
    raise exception '0074 self-check failed: another epoch did not answer reset: %', v_ans;
  end if;

  delete from public.control_shows where id = v_show;
end $$;
