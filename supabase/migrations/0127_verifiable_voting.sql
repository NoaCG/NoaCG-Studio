-- VERIFIABLE VOTING (docs/work-specs/live-production-reliability/spec.md, P1; the owner decisions
-- of 2026-11-23 in docs/work-specs/interaction/spec.md, "Owner decisions after the studio session").
--
-- What this file adds:
--   * A NEW COUNT keeps the earlier one. Going live on a Multiple choice question whose result has
--     votes asks the operator each time: continue the count (O1, as before) or start a new count.
--     A new count moves the earlier round aside, in the same transaction and under the same
--     production row lock as every Go live: its `question_id` is cleared, so the unique index of
--     0111 is free for a fresh round, and `earlier_of` keeps which question it was. Nothing is
--     deleted. The earlier round stays closed for good (only a round with a question id can go live
--     again), so a phone still holding its id is refused as "that question has closed" and never
--     counted into the new one. `audience_go_live` takes the choice as `new_count: true` inside its
--     question value, so its signature, its grant and every page from before this change stay as
--     they were;
--   * THE CHANGE POLICY, per question: `audience_rounds.allow_change`, default true (as before).
--     Go live sends it with the question (`allow_change`), and it is part of the round's snapshot:
--     it cannot change while the question is live or once it has votes (R8), and a change moves the
--     revision (R5), so a phone always knows which policy its vote is under. With changes off, the
--     first vote from a device is final: `audience_vote` refuses another with "your vote is already
--     in", the vote guard refuses an update of such a vote from any writer, and a chat voter's first
--     counted vote is final too (`audience_operator_votes`). The join resolve tells the phone
--     (`round.allowChange`), so it can say so before the vote is sent;
--   * THE BURST CAP is raised and named. 0035 and 0113 refused more than 300 phone votes per round
--     in any 10 seconds, with the same words as an invalid vote, so a big room voting together saw
--     votes refused for no reason it could read. Why 3000: a room of 3000 phones can all vote inside
--     the same ten seconds, which covers the largest venue a production here has asked about with
--     room to spare, while a script inventing device tokens is still held to 300 a second. The
--     count was a scan of every vote of the round (no index had `updated_at`), so it grew with the
--     round; it is now a bounded count (`limit 3000`) over a new partial index on (round, time) of
--     phone votes, so a vote reads at most the votes of the last ten seconds and never a hot
--     counter row. Measured on a scratch Postgres 16 with every migration applied: 3000 votes into
--     one round inside one window, each running the guard, in under two seconds (evidence in the
--     reliability spec's P1 notes). The refusal has its own words, "too many votes at once", which
--     the phone turns into "Too many votes at once. Try again in a few seconds.";
--   * `audience_votes_export(slug, round)`: a round's votes for a CSV, authorized by the control
--     slug like `audience_tally`. Each vote carries its time, option, source and a short voter key
--     that is NOT the device token: the first ten hex digits of md5(round id, ':', token), the same
--     for one device within one round and unlinkable across rounds. One jsonb value rather than a
--     set of rows, because PostgREST caps a set at a page (`max_rows`, 1000) and a big room's export
--     must hold every vote (0114 did the same for words);
--   * `audience_rounds_list` returns the two new columns (a table function's columns cannot change
--     in place, so it is dropped and recreated with its grant), and `audience_round_json` carries
--     them.
--
-- Nothing here writes to `control_events` (R16): nothing reaches air. Go live and the join resolve
-- read and write `control_shows` inside their bodies, as 0111 and 0114 did; no statement here names
-- a live-path object.
--
-- Additive for the app: every phone and operator function keeps its signature and grant, a page
-- from before this change sends no `allow_change` (read as true) and no `new_count` (a continued
-- count), and a round it reads gains keys it ignores. A phone page from before this change cannot
-- say why a final vote or a burst was refused; it shows its generic "That vote could not be
-- counted." Revert: `git revert` the app; the columns, the index and the functions can stay, since
-- with no `allow_change` and no `new_count` sent everything behaves as before except the burst cap
-- and its message, which an older page also reads as a generic refusal.

set lock_timeout = '2s';
set statement_timeout = '30s';

-- ══ 1. Columns ══════════════════════════════════════════════════════════════════════════════
-- HOW THIS FILE RUNS (supabase/AGENTS.md, "A concurrent statement runs on its own"; 0111 is the
-- worked example). Phones write audience_votes during a show, so its new index is built
-- concurrently. The CLI commits the statements before the build, runs it alone, then the rest:
--   1. the timeouts, the columns (catalog only: a constant default, or nullable), the check on
--      audience_rounds (a few rows per production), and the drop of any index a failed build left;
--   2. the build, under SHARE UPDATE EXCLUSIVE, which no vote waits on;
--   3. the proof the index is valid, then the functions and the self-check.
-- A failed build leaves an INVALID index and no ledger row; the next landing runs the file from the
-- top, where step 1 drops the leftover. Every step above is safe to run again.

alter table public.audience_rounds
  add column if not exists allow_change boolean not null default true,
  add column if not exists earlier_of   text;

-- An earlier count has no question of its own: it names the question it was a count of.
alter table public.audience_rounds drop constraint if exists audience_rounds_earlier_of_shape;
alter table public.audience_rounds add constraint audience_rounds_earlier_of_shape
  check (earlier_of is null or (question_id is null and earlier_of ~ '^[A-Za-z0-9_-]{1,64}$'));

drop index if exists public.audience_votes_recent_idx;

set statement_timeout = '5min';

-- The burst cap's count: a round's phone votes by the time they were last written.
create index concurrently audience_votes_recent_idx
  on public.audience_votes (round_id, updated_at) where source = 'phone';

set statement_timeout = '30s';

do $$
begin
  if not exists (
    select 1 from pg_index i
     where i.indexrelid = to_regclass('public.audience_votes_recent_idx')
       and i.indisvalid and i.indisready) then
    raise exception '0127: audience_votes_recent_idx is missing or invalid after its build';
  end if;
end $$;

-- ══ 2. The vote guard: the change policy, and the burst cap with its own words ══════════════
-- 0113's guard, with two changes: an UPDATE of a vote whose round does not allow changes is
-- refused, and the phones' cap is 3000 in ten seconds, counted with a bound over the new index.
create or replace function public.audience_vote_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  count_options int;
  is_open       boolean;
  may_change    boolean;
  recent        int;
begin
  if new.source = 'chat' then
    -- C2: a platform's own user id, never a display name.
    if new.device_token !~ '^(yt|tw):[A-Za-z0-9_-]{1,120}$' or new.cast_at is null then
      raise exception 'that vote could not be counted' using errcode = 'check_violation';
    end if;
  elsif new.device_token !~ '^[A-Za-z0-9_-]{8,128}$' then
    raise exception 'that vote could not be counted' using errcode = 'check_violation';
  end if;
  select jsonb_array_length(r.options), r.closed_at is null, r.allow_change
    into count_options, is_open, may_change
    from public.audience_rounds r where r.id = new.round_id;
  if count_options is null or not is_open
     or new.option_index < 0 or new.option_index >= count_options then
    raise exception 'that vote could not be counted' using errcode = 'check_violation';
  end if;
  -- The change policy (owner, 2026-11-23): with changes off, a vote stays as it was first sent.
  if tg_op = 'UPDATE' and not may_change then
    raise exception 'your vote is already in' using errcode = 'check_violation';
  end if;
  -- The phones' burst cap (C8: phones only), read with a bound so it never counts past the cap.
  if new.source = 'phone' then
    select count(*) into recent from (
      select 1 from public.audience_votes v
       where v.round_id = new.round_id and v.source = 'phone'
         and v.updated_at > now() - interval '10 seconds'
       limit 3000
    ) as within;
    if recent >= 3000 then
      raise exception 'too many votes at once' using errcode = 'check_violation';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.audience_vote_guard() from public, anon, authenticated;

-- ══ 3. A round as the operator reads it, and the list ══════════════════════════════════════
create or replace function public.audience_round_json(p_round public.audience_rounds)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id', p_round.id, 'kind', p_round.kind, 'question', p_round.question,
    'options', p_round.options, 'correct_option', p_round.correct_option,
    'opened_at', p_round.opened_at, 'closed_at', p_round.closed_at,
    'question_id', p_round.question_id, 'revision', p_round.revision,
    'allow_change', p_round.allow_change, 'earlier_of', p_round.earlier_of)
$$;
revoke execute on function public.audience_round_json(public.audience_rounds) from public, anon, authenticated;

drop function if exists public.audience_rounds_list(text);
create function public.audience_rounds_list(p_slug text)
returns table (
  id uuid, kind text, question text, options jsonb,
  correct_option int, opened_at timestamptz, closed_at timestamptz,
  question_id text, revision int, allow_change boolean, earlier_of text
) language plpgsql security definer set search_path = '' stable as $$
declare
  v_show uuid;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  return query
    select r.id, r.kind, r.question, r.options, r.correct_option, r.opened_at, r.closed_at,
           r.question_id, r.revision, r.allow_change, r.earlier_of
    from public.audience_rounds r where r.show_id = v_show order by r.opened_at;
end $$;
revoke execute on function public.audience_rounds_list(text) from public;
grant execute on function public.audience_rounds_list(text) to anon, authenticated;

-- ══ 4. Go live: 0114's, with the change policy and a new count ═════════════════════════════
-- `p_question` is { id, type, text, options?, allow_change?, new_count? }. `allow_change` absent
-- reads as true; `new_count` absent continues the count.
create or replace function public.audience_go_live(p_slug text, p_question jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_show   uuid;
  v_id     text;
  v_kind   text;
  v_text   text;
  v_opts   jsonb;
  v_change boolean;
  v_new    boolean;
  v_round  public.audience_rounds%rowtype;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  if jsonb_typeof(coalesce(p_question, 'null'::jsonb)) <> 'object' then
    raise exception 'not a question' using errcode = '22023';
  end if;
  v_id := p_question->>'id';
  if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'not a question' using errcode = '22023';
  end if;
  v_kind := case p_question->>'type' when 'open' then 'open' when 'choice' then 'poll' when 'word' then 'word' end;
  if v_kind is null then
    raise exception 'not a question' using errcode = '22023';
  end if;
  v_text := btrim(left(coalesce(p_question->>'text', ''), 200));
  if v_text = '' then
    raise exception 'a question needs its text' using errcode = '22023';
  end if;
  -- The snapshot in the guard's own normal form, so comparing it with the stored one is fair.
  if v_kind in ('open', 'word') then
    v_opts := '[]'::jsonb;
  else
    if jsonb_typeof(coalesce(p_question->'options', 'null'::jsonb)) <> 'array' then
      raise exception 'a vote needs its options' using errcode = '22023';
    end if;
    v_opts := coalesce((
      select jsonb_agg(btrim(left(value #>> '{}', 60)) order by ord)
      from jsonb_array_elements(p_question->'options') with ordinality as o(value, ord)
      where jsonb_typeof(value) = 'string' and ord <= 8
    ), '[]'::jsonb);
    if jsonb_array_length(v_opts) < 2 then
      raise exception 'a vote needs two options at least' using errcode = '22023';
    end if;
  end if;
  -- The change policy is a vote's; any other kind keeps the default.
  v_change := v_kind <> 'poll' or jsonb_typeof(p_question->'allow_change') is distinct from 'boolean'
              or (p_question->>'allow_change')::boolean;
  v_new := jsonb_typeof(p_question->'new_count') = 'boolean' and (p_question->>'new_count')::boolean;
  if v_new and v_kind <> 'poll' then
    raise exception 'a new count is for a vote' using errcode = '22023';
  end if;

  -- R1: one press at a time per production (NO KEY UPDATE: see 0111, R22).
  perform 1 from public.control_shows s where s.id = v_show for no key update;

  select * into v_round from public.audience_rounds r
    where r.show_id = v_show and r.question_id = v_id;
  if v_round.id is not null and v_round.kind <> v_kind then
    raise exception 'a question keeps its type' using errcode = '22023';
  end if;

  -- A NEW COUNT: the round with votes moves aside, kept whole and closed for good, and this
  -- question gets a fresh round below. A round with no votes has nothing to keep, so it is used as
  -- it is.
  if v_new and v_round.id is not null
     and exists (select 1 from public.audience_votes v where v.round_id = v_round.id) then
    if v_round.closed_at is null then
      raise exception 'stop the question before starting a new count' using errcode = '22023';
    end if;
    update public.audience_rounds r set question_id = null, earlier_of = v_id
      where r.id = v_round.id;
    v_round.id := null;
  end if;

  if v_round.id is not null then
    if v_round.question is distinct from v_text or v_round.options is distinct from v_opts
       or v_round.allow_change is distinct from v_change then
      -- R8: the result always matches what was asked, and the rule it was asked under.
      if v_round.closed_at is null then
        raise exception 'a live question cannot change' using errcode = '22023';
      end if;
      if exists (select 1 from public.audience_submissions x where x.round_id = v_round.id)
         or exists (select 1 from public.audience_votes v where v.round_id = v_round.id) then
        raise exception 'this question has answers, so it cannot change' using errcode = '22023';
      end if;
      update public.audience_rounds r
        set question = v_text, options = v_opts, allow_change = v_change, revision = r.revision + 1
        where r.id = v_round.id;
    end if;
  end if;

  update public.audience_rounds r set closed_at = now()
    where r.show_id = v_show and r.closed_at is null and r.id is distinct from v_round.id;

  if v_round.id is null then
    insert into public.audience_rounds (show_id, kind, question, options, question_id, allow_change)
      values (v_show, v_kind, v_text, v_opts, v_id, v_change)
      returning * into v_round;
  else
    update public.audience_rounds r
      set closed_at = null, opened_at = case when r.closed_at is null then r.opened_at else now() end
      where r.id = v_round.id
      returning * into v_round;
  end if;

  update public.control_shows s set audience_state = s.audience_state || jsonb_build_object(
      'open', true,
      'mode', case v_kind when 'open' then 'question' when 'word' then 'word' else 'poll' end,
      'prompt', v_text,
      'round', v_round.id,
      'question', v_id,
      'rev', coalesce((s.audience_state->>'rev')::int, 0) + 1
    ) where s.id = v_show;
  return public.audience_round_json(v_round);
end $$;

-- ══ 5. The phone's vote: final when the round says so ═══════════════════════════════════════
create or replace function public.audience_vote(
  p_join_slug text, p_device text, p_round uuid, p_option int, p_revision int
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_show   uuid;
  v_owner  uuid;
  v_round  uuid;
  v_change boolean;
  v_rows   int;
  v_msg    text;
begin
  select s.id, s.owner_id into v_show, v_owner
    from public.control_shows s where s.join_slug = p_join_slug and p_join_slug is not null;
  if v_show is null or public.feature_denied_for(v_owner, 'audience') then
    raise exception 'that vote could not be counted' using errcode = 'check_violation';
  end if;
  -- FOR SHARE (0111, R6): Go live, Stop and Clear results wait for this vote or are seen by it.
  select r.id, r.allow_change into v_round, v_change from public.audience_rounds r
    where r.id = p_round and r.show_id = v_show and r.kind in ('poll', 'quiz')
      and r.closed_at is null and r.revision = p_revision
    for share;
  if v_round is null then
    raise exception 'that question has closed' using errcode = 'check_violation';
  end if;
  begin
    if v_change then
      -- The upsert IS "change your mind while the question is live": the key is (round, device).
      insert into public.audience_votes (round_id, device_token, option_index)
        values (v_round, p_device, p_option)
        on conflict (round_id, device_token)
        do update set option_index = excluded.option_index, updated_at = now();
    else
      -- Final: the first vote stands. Two first votes at once take turns on the key, and the
      -- second finds the first.
      insert into public.audience_votes (round_id, device_token, option_index)
        values (v_round, p_device, p_option)
        on conflict (round_id, device_token) do nothing;
    end if;
    get diagnostics v_rows = row_count;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg in ('too many votes at once', 'your vote is already in') then
      raise exception '%', v_msg using errcode = 'check_violation';
    end if;
    raise exception 'that vote could not be counted' using errcode = 'check_violation';
  end;
  if v_rows = 0 then
    raise exception 'your vote is already in' using errcode = 'check_violation';
  end if;
end $$;

-- ══ 6. Chat votes: a chat voter's first vote is final too ═══════════════════════════════════
-- 0113's door. With changes allowed, as before: each voter's latest by platform time. With changes
-- off: each voter's earliest in the call, and a voter already counted is not counted again.
create or replace function public.audience_operator_votes(p_slug text, p_round uuid, p_items jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_show    uuid;
  v_round   public.audience_rounds%rowtype;
  v_from    timestamptz;
  v_counted int := 0;
  v_recent  int;
  v_rows    int;
  v_item    record;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'items must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'at most 500 votes at a time' using errcode = '22023';
  end if;
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  select * into v_round from public.audience_rounds r
    where r.id = p_round and r.show_id = v_show and r.kind = 'poll' and r.closed_at is null
    for share;
  if v_round.id is null then
    raise exception 'that question has closed' using errcode = 'check_violation';
  end if;
  select count(*) into v_recent from public.audience_votes v
    where v.round_id = v_round.id and v.source = 'chat' and v.updated_at > now() - interval '10 seconds';
  if v_recent >= 5000 then
    raise exception 'too many chat votes at once' using errcode = 'check_violation';
  end if;

  v_from := v_round.opened_at - interval '1 second';

  for v_item in
    select distinct on (x.voter) x.voter, x.opt, x.at
    from (
      select e.value->>'voter' as voter,
             case when e.value->>'option' ~ '^[0-9]{1,2}$' then (e.value->>'option')::int end as opt,
             case when e.value->>'at' ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-][01][0-9]:[0-5][0-9])$'
                  then case when substr(e.value->>'at', 9, 2)::int <= extract(day from
                         make_date(substr(e.value->>'at', 1, 4)::int, substr(e.value->>'at', 6, 2)::int, 1)
                         + interval '1 month' - interval '1 day')
                       then (e.value->>'at')::timestamptz end
             end as at,
             e.ord
      from jsonb_array_elements(p_items) with ordinality as e(value, ord)
      where jsonb_typeof(e.value) = 'object'
        and coalesce(e.value->>'voter', '') ~ '^(yt|tw):[A-Za-z0-9_-]{1,120}$'
    ) as x
    where x.opt is not null and x.at is not null
      and x.at >= v_from and x.at <= now() + interval '1 minute'
      and x.opt < jsonb_array_length(v_round.options)
    -- Changes allowed: the latest said, of equal times the last to arrive. Final: the first said,
    -- of equal times the first to arrive.
    order by x.voter,
             case when v_round.allow_change then x.at end desc nulls last,
             case when v_round.allow_change then null else x.at end asc nulls last,
             case when v_round.allow_change then -x.ord else x.ord end
  loop
    insert into public.audience_votes as v (round_id, device_token, option_index, source, cast_at)
      values (v_round.id, v_item.voter, v_item.opt, 'chat', v_item.at)
      on conflict (round_id, device_token) do update
        set option_index = excluded.option_index, cast_at = excluded.cast_at, updated_at = now()
        -- C4: an older message never overwrites a newer one; with changes off, nothing does.
        where v.source = 'chat' and v_round.allow_change and v.cast_at <= excluded.cast_at;
    get diagnostics v_rows = row_count;
    v_counted := v_counted + v_rows;
  end loop;
  return v_counted;
end $$;

-- ══ 7. The join resolve tells the phone whether its vote can change ═════════════════════════
-- 0114's, with `allowChange` on the round. Same columns, so a replace.
create or replace function public.audience_join_by_slug(p_join_slug text, p_device text)
returns table (production_name text, state jsonb, brand jsonb, mine jsonb, my_vote int)
language plpgsql security definer set search_path = '' stable as $$
declare
  v_show    uuid;
  v_owner   uuid;
  v_title   text;
  v_state   jsonb;
  v_denied  boolean;
  v_round   public.audience_rounds%rowtype;
begin
  select s.id, s.owner_id, s.title, s.audience_state
    into v_show, v_owner, v_title, v_state
    from public.control_shows s where s.join_slug = p_join_slug and p_join_slug is not null;
  if v_show is null then
    return;
  end if;
  v_denied := public.feature_denied_for(v_owner, 'audience');

  select * into v_round from public.audience_rounds r
    where r.show_id = v_show and r.closed_at is null
    order by r.opened_at desc limit 1;

  production_name := v_title;
  state := jsonb_build_object(
    -- R18: open only while a round is, so a state left by an older page shows the waiting text.
    'open', (coalesce((v_state->>'open')::boolean, false) and not v_denied and v_round.id is not null),
    'mode', case when v_round.id is null then 'waiting' else coalesce(v_state->>'mode', 'waiting') end,
    'prompt', coalesce(v_state->>'prompt', ''),
    -- The round WITHOUT its answer key, its question id or any tally.
    'round', case when v_round.id is null then null else jsonb_build_object(
      'id', v_round.id,
      'kind', v_round.kind,
      'question', v_round.question,
      'options', v_round.options,
      'openedAt', v_round.opened_at,
      'revision', v_round.revision,
      'allowChange', v_round.allow_change
    ) end
  );
  brand := v_state->'brand';
  mine := coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'body', x.body, 'createdAt', x.created_at, 'roundId', x.round_id,
                                        'word', coalesce(r.kind = 'word', false))
                     order by x.created_at)
    from public.audience_submissions x
    left join public.audience_rounds r on r.id = x.round_id
    where x.show_id = v_show and x.device_token = p_device
  ), '[]'::jsonb);
  my_vote := (
    select v.option_index from public.audience_votes v
    where v.round_id = v_round.id and v.device_token = p_device
  );
  return next;
end $$;

-- ══ 8. The export: a round's votes, each under a key that is not the device ═════════════════
-- { round: <the round as the operator reads it>, votes: [{ at, option, source, voter }] }, oldest
-- first. `at` is when the server last took the vote as it stands; `voter` is the first ten hex
-- digits of md5(round id, ':', device token or chat voter).
create or replace function public.audience_votes_export(p_slug text, p_round uuid)
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare
  v_show  uuid;
  v_round public.audience_rounds%rowtype;
begin
  select o.show_id into v_show from public.audience_owner_for_control(p_slug) o;
  select * into v_round from public.audience_rounds r where r.id = p_round and r.show_id = v_show;
  if v_round.id is null then
    raise exception 'unknown round';
  end if;
  return jsonb_build_object(
    'round', public.audience_round_json(v_round),
    'votes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'at', v.updated_at,
               'option', v.option_index,
               'source', v.source,
               'voter', left(pg_catalog.md5(v.round_id::text || ':' || v.device_token), 10))
             order by v.updated_at, v.device_token)
        from public.audience_votes v
       where v.round_id = v_round.id
    ), '[]'::jsonb));
end $$;
revoke execute on function public.audience_votes_export(text, uuid) from public;
grant execute on function public.audience_votes_export(text, uuid) to anon, authenticated;

-- ══ 9. Prove it by calling it ═══════════════════════════════════════════════════════════════
-- A throwaway production against a real owner, walked through a final vote, a new count and an
-- export, then removed. A shape check alone would have passed 0035's broken `audience_open_round`
-- (supabase/AGENTS.md).
do $$
declare
  v_owner  uuid;
  v_show   uuid := '00000000-0127-4000-8000-000000000127';
  v_slug   text;
  v_join   text;
  v_first  jsonb;
  v_again  jsonb;
  v_free   jsonb;
  v_export jsonb;
  v_t      record;
  v_n      int;
  v_fail   boolean;
  v_msg    text;
  v_now    timestamptz := now();
  g        int;
begin
  -- The grants: the export is the operator's door, and nothing beyond it.
  if has_function_privilege('public', 'public.audience_votes_export(text, uuid)', 'execute') then
    raise exception '0127 self-check failed: the export is executable by public';
  end if;
  if not has_function_privilege('anon', 'public.audience_votes_export(text, uuid)', 'execute')
     or not has_function_privilege('anon', 'public.audience_rounds_list(text)', 'execute') then
    raise exception '0127 self-check failed: an operator read is not executable by its slug holder';
  end if;

  select u.id into v_owner from auth.users u where not public.feature_denied_for(u.id, 'audience') limit 1;
  if v_owner is null then
    raise notice '0127 self-check skipped: no account here may use the audience feature';
    return;
  end if;
  insert into public.control_shows (id, owner_id, title) values (v_show, v_owner, 'Verifiable voting self-check');
  select s.slug, s.join_slug into v_slug, v_join from public.control_shows s where s.id = v_show;

  -- A final vote: the first stands, a second from the same phone is refused by name.
  v_first := public.audience_go_live(v_slug, '{"id":"q-final","type":"choice","text":"Which?","options":["A","B"],"allow_change":false}');
  if (v_first->>'allow_change')::boolean is not false then
    raise exception '0127 self-check failed: go live did not keep the change policy: %', v_first;
  end if;
  perform public.audience_vote(v_join, 'device-one-0127', (v_first->>'id')::uuid, 0, 1);
  begin
    perform public.audience_vote(v_join, 'device-one-0127', (v_first->>'id')::uuid, 1, 1);
    v_fail := false;
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    v_fail := v_msg = 'your vote is already in';
  end;
  if not v_fail then
    raise exception '0127 self-check failed: a second vote was not refused as final';
  end if;
  -- The guard holds it for any writer.
  begin
    update public.audience_votes v set option_index = 1
      where v.round_id = (v_first->>'id')::uuid and v.device_token = 'device-one-0127';
    v_fail := false;
  exception when check_violation then
    v_fail := true;
  end;
  if not v_fail then
    raise exception '0127 self-check failed: the guard let a final vote change';
  end if;
  -- A chat voter's first counted vote is final too.
  perform public.audience_operator_votes(v_slug, (v_first->>'id')::uuid,
    jsonb_build_array(jsonb_build_object('voter', 'tw:7001', 'option', 1, 'at', v_now)));
  v_n := public.audience_operator_votes(v_slug, (v_first->>'id')::uuid,
    jsonb_build_array(jsonb_build_object('voter', 'tw:7001', 'option', 0, 'at', v_now + interval '1 second')));
  select * into v_t from public.audience_tally(v_slug, (v_first->>'id')::uuid);
  if v_n <> 0 or v_t.counts <> '[1,1]'::jsonb then
    raise exception '0127 self-check failed: final votes counted % then %', v_n, row_to_json(v_t);
  end if;

  -- The join resolve says so, before the phone sends.
  if (select (j.state->'round'->>'allowChange')::boolean from public.audience_join_by_slug(v_join, 'device-two-0127') j) is not false then
    raise exception '0127 self-check failed: the join resolve does not carry the change policy';
  end if;

  -- The policy is part of what was asked: not while live, not once voted (R8).
  begin
    perform public.audience_go_live(v_slug, '{"id":"q-final","type":"choice","text":"Which?","options":["A","B"]}');
    v_fail := false;
  exception when sqlstate '22023' then
    v_fail := true;
  end;
  if not v_fail then
    raise exception '0127 self-check failed: the change policy changed while live';
  end if;

  -- A new count is refused while live, then moves the counted round aside after Stop.
  begin
    perform public.audience_go_live(v_slug, '{"id":"q-final","type":"choice","text":"Which?","options":["A","B"],"allow_change":false,"new_count":true}');
    v_fail := false;
  exception when sqlstate '22023' then
    v_fail := true;
  end;
  if not v_fail then
    raise exception '0127 self-check failed: a new count started while live';
  end if;
  perform public.audience_stop(v_slug, (v_first->>'id')::uuid);
  v_again := public.audience_go_live(v_slug, '{"id":"q-final","type":"choice","text":"Which?","options":["A","B"],"allow_change":false,"new_count":true}');
  if v_again->>'id' = v_first->>'id' or (v_again->>'allow_change')::boolean is not false
     or v_again->>'question_id' <> 'q-final' then
    raise exception '0127 self-check failed: a new count made %', v_again;
  end if;
  if not exists (select 1 from public.audience_rounds r
                  where r.id = (v_first->>'id')::uuid and r.question_id is null
                    and r.earlier_of = 'q-final' and r.closed_at is not null) then
    raise exception '0127 self-check failed: the earlier count was not kept aside';
  end if;
  if (select t.total from public.audience_tally(v_slug, (v_first->>'id')::uuid) t) <> 2
     or (select t.total from public.audience_tally(v_slug, (v_again->>'id')::uuid) t) <> 0 then
    raise exception '0127 self-check failed: the counts moved with the new count';
  end if;
  -- A phone holding the earlier round is refused as closed, and counts nowhere.
  begin
    perform public.audience_vote(v_join, 'device-two-0127', (v_first->>'id')::uuid, 1, 1);
    v_fail := false;
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    v_fail := v_msg = 'that question has closed';
  end;
  if not v_fail then
    raise exception '0127 self-check failed: a vote to the earlier count was not refused as closed';
  end if;
  perform public.audience_vote(v_join, 'device-one-0127', (v_again->>'id')::uuid, 1, 1);
  if (select count(*) from public.audience_rounds_list(v_slug) l where l.earlier_of = 'q-final') <> 1 then
    raise exception '0127 self-check failed: the list does not show the earlier count';
  end if;

  -- Continue after Stop reopens the same round, and its count goes on.
  perform public.audience_stop(v_slug, (v_again->>'id')::uuid);
  if public.audience_go_live(v_slug, '{"id":"q-final","type":"choice","text":"Which?","options":["A","B"],"allow_change":false}')->>'id'
     <> v_again->>'id' then
    raise exception '0127 self-check failed: continue did not reopen the current count';
  end if;

  -- The export: every vote, each under a short key that is not its device.
  v_export := public.audience_votes_export(v_slug, (v_first->>'id')::uuid);
  if jsonb_array_length(v_export->'votes') <> 2
     or v_export->'round'->>'earlier_of' <> 'q-final'
     or not exists (select 1 from jsonb_array_elements(v_export->'votes') e
                     where e.value->>'source' = 'phone' and (e.value->>'option')::int = 0
                       and e.value->>'voter' ~ '^[0-9a-f]{10}$' and e.value->>'voter' <> 'device-one-0127') then
    raise exception '0127 self-check failed: the export gave %', v_export;
  end if;
  -- The same phone has another key in another round.
  if (select e.value->>'voter' from jsonb_array_elements(v_export->'votes') e where e.value->>'source' = 'phone')
     = (select e.value->>'voter' from jsonb_array_elements(public.audience_votes_export(v_slug, (v_again->>'id')::uuid)->'votes') e) then
    raise exception '0127 self-check failed: a voter key links two rounds';
  end if;

  -- With no policy sent, a vote can change, as before.
  v_free := public.audience_go_live(v_slug, '{"id":"q-free","type":"choice","text":"Free?","options":["A","B"]}');
  perform public.audience_vote(v_join, 'device-one-0127', (v_free->>'id')::uuid, 0, 1);
  perform public.audience_vote(v_join, 'device-one-0127', (v_free->>'id')::uuid, 1, 1);
  select * into v_t from public.audience_tally(v_slug, (v_free->>'id')::uuid);
  if v_t.counts <> '[0,1]'::jsonb then
    raise exception '0127 self-check failed: a changeable vote did not change: %', row_to_json(v_t);
  end if;

  -- The burst cap: 3000 phones inside one window are all counted, the next is refused by name.
  for g in 1..2999 loop
    perform public.audience_vote(v_join, 'device-burst-' || lpad(g::text, 5, '0'), (v_free->>'id')::uuid, g % 2, 1);
  end loop;
  begin
    perform public.audience_vote(v_join, 'device-burst-late', (v_free->>'id')::uuid, 0, 1);
    v_fail := false;
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    v_fail := v_msg = 'too many votes at once';
  end;
  if not v_fail then
    raise exception '0127 self-check failed: vote 3001 in ten seconds was not refused as a burst';
  end if;
  if (select t.total from public.audience_tally(v_slug, (v_free->>'id')::uuid) t) <> 3000 then
    raise exception '0127 self-check failed: the burst counted %', (select t.total from public.audience_tally(v_slug, (v_free->>'id')::uuid) t);
  end if;

  delete from public.control_shows s where s.id = v_show;
end $$;
